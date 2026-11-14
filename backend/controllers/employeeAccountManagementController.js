import { prisma } from '../db.js';

import {
  setManagedAccountStatus,
  closeManagedAccount
} from '../services/accountService.js';

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

    if (error.sqlState === '45000') {
      const message = error.sqlMessage;

      const status =
        message === 'Account not found'
          ? 404
          : message === 'Permission denied'
            ? 403
            : 409;

      return res.status(status).json({ error: message });
    }

    if (
      ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']
        .includes(error.code)
    ) {
      return res.status(409).json({
        error: 'Operation interrupted. Refresh the account before retrying.'
      });
    }

    next(error);
  }
};

function accountNumber(value) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,19}$/.test(value) ||
    BigInt(value) > 18446744073709551615n
  ) {
    fail(400, 'Invalid account number');
  }

  return BigInt(value);
}

function pageNumber(value) {
  const page = Number(value ?? 1);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000
  ) {
    fail(400, 'Invalid page');
  }

  return page;
}

function reasonText(value) {
  if (
    typeof value !== 'string' ||
    value.trim().length < 5 ||
    value.trim().length > 255
  ) {
    fail(400, 'Reason must contain 5 to 255 characters');
  }

  return value.trim();
}

function scopedWhere(req) {
  return req.employeeScope.allBranches
    ? {}
    : { branch_ifsc: req.employeeScope.branchIfsc };
}

async function personalAccess(req) {
  const rows = await prisma.$queryRaw`
    SELECT fn_has_permission(
      ${req.user.id}, 'VIEW_PERSONAL_INFO'
    ) AS allowed
  `;

  return Number(rows[0].allowed) === 1;
}

const accountSelect = personal => ({
  acc_no: true,
  balance: true,
  status: true,
  is_primary: true,
  creation_date: true,
  validity: true,
  closed_date: true,

  branch: {
    select: {
      ifsc_code: true,
      branch_name: true
    }
  },

  account_type: {
    select: {
      type_name: true,
      min_balance: true,
      interest_rate: true
    }
  },

  ...(
    personal
      ? {
          cust_id: true,
          customer: { select: { name: true } }
        }
      : {}
  )
});

const formatAccount = (row, personal) => ({
  accountNumber: String(row.acc_no),
  balance: row.balance.toString(),
  status: row.status,
  isPrimary: row.is_primary,
  openingDate: row.creation_date,
  validity: row.validity,
  closedDate: row.closed_date,
  branchIfsc: row.branch.ifsc_code,
  branchName: row.branch.branch_name,
  accountType: row.account_type.type_name,
  minBalance: row.account_type.min_balance.toString(),
  interestRate: row.account_type.interest_rate.toString(),

  ...(
    personal
      ? {
          customerId: row.cust_id,
          customerName: row.customer.name
        }
      : {}
  )
});

async function findAccount(req, personal = false) {
  const row = await prisma.account.findFirst({
    where: {
      acc_no: accountNumber(req.params.accNo),
      ...scopedWhere(req)
    },

    select: accountSelect(personal)
  });

  if (!row) fail(404, 'Account not found');

  return row;
}

export const getAccountFilters = endpoint(async (req, res) => {
  const [branches, types] = await Promise.all([
    prisma.branch.findMany({
      where: req.employeeScope.allBranches
        ? {}
        : { ifsc_code: req.employeeScope.branchIfsc },

      select: {
        ifsc_code: true,
        branch_name: true
      },

      orderBy: { branch_name: 'asc' }
    }),

    prisma.account_type.findMany({
      select: {
        type_id: true,
        type_name: true
      },

      orderBy: { type_id: 'asc' }
    })
  ]);

  res.json({
    branches: branches.map(row => ({
      ifscCode: row.ifsc_code,
      name: row.branch_name
    })),

    types: types.map(row => ({
      typeId: row.type_id,
      name: row.type_name
    }))
  });
});

export const listEmployeeAccounts = endpoint(async (req, res) => {
  const personal = await personalAccess(req);
  const page = pageNumber(req.query.page);

  const q = req.query.q ?? '';
  const status = req.query.status ?? '';
  const typeId = req.query.typeId ?? '';
  const branch = req.query.branchIfsc ?? '';

  if (
    typeof q !== 'string' ||
    q.length > 100 ||
    !['', 'ACTIVE', 'FROZEN', 'CLOSED'].includes(status)
  ) {
    fail(400, 'Invalid search or status');
  }

  if (
    typeof typeId !== 'string' ||
    (
      typeId !== '' &&
      (
        !/^[1-9]\d{0,9}$/.test(typeId) ||
        Number(typeId) > 2147483647
      )
    )
  ) {
    fail(400, 'Invalid account type');
  }

  if (
    typeof branch !== 'string' ||
    (
      branch !== '' &&
      !/^[A-Z0-9]{11}$/.test(branch)
    )
  ) {
    fail(400, 'Invalid branch');
  }

  if (
    branch &&
    !req.employeeScope.allBranches &&
    branch !== req.employeeScope.branchIfsc
  ) {
    fail(403, 'Cannot access another branch');
  }

  const term = q.trim();
  let search = {};

  if (term) {
    if (!personal) {
      search = { acc_no: accountNumber(term) };
    } else {
      const numeric =
        /^[1-9]\d{0,19}$/.test(term) &&
        BigInt(term) <= 18446744073709551615n;

      search = {
        OR: [
          { customer: { name: { contains: term } } },

          ...(numeric
            ? [{ acc_no: BigInt(term) }]
            : [])
        ]
      };
    }
  }

  const where = {
    AND: [
      scopedWhere(req),
      search,
      ...(status ? [{ status }] : []),
      ...(typeId ? [{ type_id: Number(typeId) }] : []),
      ...(branch ? [{ branch_ifsc: branch }] : [])
    ]
  };

  const [rows, total] = await Promise.all([
    prisma.account.findMany({
      where,
      select: accountSelect(personal),
      skip: (page - 1) * 20,
      take: 20,
      orderBy: { acc_no: 'desc' }
    }),

    prisma.account.count({ where })
  ]);

  res.json({
    accounts: rows.map(row => formatAccount(row, personal)),
    page,
    total,
    totalPages: Math.ceil(total / 20)
  });
});

export const getEmployeeAccount = endpoint(async (req, res) => {
  const personal = await personalAccess(req);

  res.json({
    account: formatAccount(
      await findAccount(req, personal),
      personal
    )
  });
});

export const getEmployeeAccountTransactions = endpoint(
  async (req, res) => {
    const account = await findAccount(req);
    const personal = await personalAccess(req);
    const page = pageNumber(req.query.page);
    const offset = (page - 1) * 20;

    const [rows, counts] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          trans_id,
          reference_no,
          trans_date,
          trans_type,
          trans_mode,
          amount,
          trans_status,
          direction,
          counterparty_acc_no,
          CASE
            WHEN ${personal ? 1 : 0} = 1 THEN remarks
            ELSE NULL
          END AS remarks
        FROM v_transaction_history
        WHERE acc_no = ${account.acc_no}
        ORDER BY trans_date DESC, trans_id DESC
        LIMIT 20 OFFSET ${offset}
      `,

      prisma.$queryRaw`
        SELECT COUNT(*) AS total
        FROM v_transaction_history
        WHERE acc_no = ${account.acc_no}
      `
    ]);

    const total = Number(counts[0].total);

    res.json({
      transactions: rows.map(row => ({
        transactionId: String(row.trans_id),
        referenceNumber: row.reference_no,
        date: row.trans_date,
        type: row.trans_type,
        mode: row.trans_mode,
        amount: row.amount.toString(),
        status: row.trans_status,
        direction: row.direction,

        counterpartyAccount:
          row.counterparty_acc_no == null
            ? null
            : String(row.counterparty_acc_no),

        ...(personal ? { remarks: row.remarks } : {})
      })),

      page,
      total,
      totalPages: Math.ceil(total / 20)
    });
  }
);

export const setEmployeeAccountStatus = endpoint(
  async (req, res) => {
    const accNo = String(accountNumber(req.params.accNo));
    const status = req.body?.status;

    if (!['ACTIVE', 'FROZEN'].includes(status)) {
      fail(400, 'Status must be ACTIVE or FROZEN');
    }

    const reason = reasonText(req.body?.reason);

    await setManagedAccountStatus({
      accNo,
      status,
      employeeId: req.user.id,
      reason
    });

    res.json({
      message: status === 'FROZEN'
        ? 'Account frozen'
        : 'Account unfrozen'
    });
  }
);

export const closeEmployeeAccount = endpoint(async (req, res) => {
  const accNo = String(accountNumber(req.params.accNo));
  const reason = reasonText(req.body?.reason);

  await closeManagedAccount({
    accNo,
    employeeId: req.user.id,
    reason
  });

  res.json({ message: 'Account closed' });
});