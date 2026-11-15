import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

const endpoint = handler => async (req, res, next) => {
  res.set('Cache-Control', 'no-store');

  try {
    await handler(req, res);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message
      });
    }

    next(error);
  }
};

const JOINS = Prisma.sql`
  FROM bank_transaction t
  LEFT JOIN account fa ON fa.acc_no = t.from_acc_no
  LEFT JOIN account ta ON ta.acc_no = t.to_acc_no
  LEFT JOIN customer fc ON fc.cust_id = fa.cust_id
  LEFT JOIN customer tc ON tc.cust_id = ta.cust_id
`;

function scopeClause(scope) {
  return scope.allBranches
    ? Prisma.sql`1 = 1`
    : Prisma.sql`
        (
          fa.branch_ifsc = ${scope.branchIfsc}
          OR ta.branch_ifsc = ${scope.branchIfsc}
        )
      `;
}

function parameter(query, key, maximum = 100) {
  const value = query[key] ?? '';

  if (
    typeof value !== 'string' ||
    value.length > maximum
  ) {
    fail(400, `Invalid ${key}`);
  }

  return value.trim();
}

function dateValue(value, label) {
  if (!value) return;

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    fail(400, `Invalid ${label}`);
  }
}

function cents(value) {
  const [whole, part = ''] = value.split('.');

  return BigInt(whole) * 100n +
    BigInt(part.padEnd(2, '0'));
}

function filters(req) {
  const query = req.query;

  const account = parameter(query, 'accountNumber', 20);
  const reference = parameter(query, 'reference', 36);
  const type = parameter(query, 'type', 10);
  const mode = parameter(query, 'mode', 10);
  const status = parameter(query, 'status', 10);
  const from = parameter(query, 'fromDate', 10);
  const to = parameter(query, 'toDate', 10);
  const minimum = parameter(query, 'minAmount', 16);
  const maximum = parameter(query, 'maxAmount', 16);
  const branch = parameter(query, 'branchIfsc', 11);

  const pageText = parameter(query, 'page', 4) || '1';
  const page = Number(pageText);

  if (
    !/^[1-9]\d*$/.test(pageText) ||
    !Number.isSafeInteger(page) ||
    page > 1000
  ) {
    fail(400, 'Invalid page');
  }

  if (
    account &&
    (
      !/^[1-9]\d{0,19}$/.test(account) ||
      BigInt(account) > 18446744073709551615n
    )
  ) {
    fail(400, 'Invalid account number');
  }

  if (
    reference &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(reference)
  ) {
    fail(400, 'Enter the complete reference UUID');
  }

  if (
    !['', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER']
      .includes(type)
  ) {
    fail(400, 'Invalid type');
  }

  if (
    ![
      '', 'CASH', 'UPI', 'NEFT', 'IMPS',
      'CARD', 'CHEQUE', 'INTERNAL'
    ].includes(mode)
  ) {
    fail(400, 'Invalid mode');
  }

  if (!['', 'SUCCESS', 'FAILED', 'PENDING'].includes(status)) {
    fail(400, 'Invalid status');
  }

  dateValue(from, 'start date');
  dateValue(to, 'end date');

  if (from && to && from > to) {
    fail(400, 'Start date must not follow end date');
  }

  for (const amount of [minimum, maximum]) {
    if (
      amount &&
      !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(amount)
    ) {
      fail(
        400,
        'Amounts must be non-negative with at most two decimal places'
      );
    }
  }

  if (
    minimum &&
    maximum &&
    cents(minimum) > cents(maximum)
  ) {
    fail(400, 'Minimum amount must not exceed maximum');
  }

  if (branch && !/^[A-Z0-9]{11}$/.test(branch)) {
    fail(400, 'Invalid branch');
  }

  if (
    branch &&
    !req.employeeScope.allBranches &&
    branch !== req.employeeScope.branchIfsc
  ) {
    fail(403, 'Cannot access another branch');
  }

  const clauses = [scopeClause(req.employeeScope)];

  if (account) {
    clauses.push(Prisma.sql`
      (
        t.from_acc_no = CAST(${account} AS UNSIGNED)
        OR t.to_acc_no = CAST(${account} AS UNSIGNED)
      )
    `);
  }

  if (reference) {
    clauses.push(Prisma.sql`t.reference_no = ${reference}`);
  }

  if (type) {
    clauses.push(Prisma.sql`t.trans_type = ${type}`);
  }

  if (mode) {
    clauses.push(Prisma.sql`t.trans_mode = ${mode}`);
  }

  if (status) {
    clauses.push(Prisma.sql`t.trans_status = ${status}`);
  }

  if (from) {
    clauses.push(Prisma.sql`
      t.trans_date >= ${from + ' 00:00:00'}
    `);
  }

  if (to) {
    clauses.push(Prisma.sql`
      t.trans_date <= ${to + ' 23:59:59'}
    `);
  }

  if (minimum) {
    clauses.push(Prisma.sql`
      t.amount >= CAST(${minimum} AS DECIMAL(15,2))
    `);
  }

  if (maximum) {
    clauses.push(Prisma.sql`
      t.amount <= CAST(${maximum} AS DECIMAL(15,2))
    `);
  }

  if (branch) {
    clauses.push(Prisma.sql`
      (
        fa.branch_ifsc = ${branch}
        OR ta.branch_ifsc = ${branch}
      )
    `);
  }

  return {
    page,
    where: Prisma.join(clauses, ' AND ')
  };
}

export const getTransactionFilters = endpoint(async (req, res) => {
  const scope = req.employeeScope;

  const [branches, modes] = await Promise.all([
    prisma.branch.findMany({
      where: scope.allBranches
        ? {}
        : { ifsc_code: scope.branchIfsc },

      select: {
        ifsc_code: true,
        branch_name: true
      },

      orderBy: { branch_name: 'asc' }
    }),

    prisma.$queryRaw`
      SELECT DISTINCT t.trans_mode
      ${JOINS}
      WHERE ${scopeClause(scope)}
    `
  ]);

  res.json({
    branches: branches.map(row => ({
      ifscCode: row.ifsc_code,
      name: row.branch_name
    })),

    modes: modes.map(row => row.trans_mode).sort()
  });
});

export const listEmployeeTransactions = endpoint(
  async (req, res) => {
    const { page, where } = filters(req);
    const scope = req.employeeScope;

    const flags = await prisma.$queryRaw`
      SELECT fn_has_permission(
        ${req.user.id}, 'VIEW_PERSONAL_INFO'
      ) AS allowed
    `;

    const personal = Number(flags[0].allowed) === 1;
    const allBranches = scope.allBranches ? 1 : 0;

    const [rows, counts] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          t.trans_id,
          t.reference_no,
          DATE_FORMAT(
            t.trans_date, '%Y-%m-%d %H:%i:%s'
          ) AS recorded_at,
          t.trans_type,
          t.trans_mode,
          t.trans_status,
          t.amount,
          t.from_acc_no,
          t.to_acc_no,
          fa.branch_ifsc AS from_branch,
          ta.branch_ifsc AS to_branch,

          CASE
            WHEN ${personal ? 1 : 0} = 1
              AND (
                ${allBranches} = 1
                OR fa.branch_ifsc = ${scope.branchIfsc}
              )
            THEN fc.name
            ELSE NULL
          END AS from_name,

          CASE
            WHEN ${personal ? 1 : 0} = 1
              AND (
                ${allBranches} = 1
                OR ta.branch_ifsc = ${scope.branchIfsc}
              )
            THEN tc.name
            ELSE NULL
          END AS to_name,

          CASE
            WHEN ${personal ? 1 : 0} = 1
              AND (
                ${allBranches} = 1
                OR (
                  (
                    fa.acc_no IS NULL
                    OR fa.branch_ifsc = ${scope.branchIfsc}
                  )
                  AND (
                    ta.acc_no IS NULL
                    OR ta.branch_ifsc = ${scope.branchIfsc}
                  )
                )
              )
            THEN t.remarks
            ELSE NULL
          END AS visible_remarks

        ${JOINS}
        WHERE ${where}
        ORDER BY t.trans_date DESC, t.trans_id DESC
        LIMIT 20 OFFSET ${(page - 1) * 20}
      `,

      prisma.$queryRaw`
        SELECT COUNT(*) AS total
        ${JOINS}
        WHERE ${where}
      `
    ]);

    const total = Number(counts[0].total);

    res.json({
      transactions: rows.map(row => {
        const fromVisible = personal && (
          scope.allBranches ||
          row.from_branch === scope.branchIfsc
        );

        const toVisible = personal && (
          scope.allBranches ||
          row.to_branch === scope.branchIfsc
        );

        const remarksVisible = personal && (
          scope.allBranches ||
          (
            (
              row.from_acc_no == null ||
              row.from_branch === scope.branchIfsc
            )
            &&
            (
              row.to_acc_no == null ||
              row.to_branch === scope.branchIfsc
            )
          )
        );

        return {
          transactionId: String(row.trans_id),
          referenceNumber: row.reference_no,
          date: row.recorded_at,
          type: row.trans_type,
          mode: row.trans_mode,
          status: row.trans_status,
          amount: row.amount.toString(),

          fromAccount: row.from_acc_no == null
            ? null
            : String(row.from_acc_no),

          toAccount: row.to_acc_no == null
            ? null
            : String(row.to_acc_no),

          fromBranch: row.from_branch,
          toBranch: row.to_branch,

          ...(fromVisible && row.from_name != null
            ? { fromCustomerName: row.from_name }
            : {}),

          ...(toVisible && row.to_name != null
            ? { toCustomerName: row.to_name }
            : {}),

          ...(remarksVisible && row.visible_remarks != null
            ? { remarks: row.visible_remarks }
            : {})
        };
      }),

      page,
      total,
      totalPages: Math.min(1000, Math.ceil(total / 20)),
      refineFilters: total > 20000
    });
  }
);