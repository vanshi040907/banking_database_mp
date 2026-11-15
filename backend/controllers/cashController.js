import { prisma } from '../db.js';
import { recordCash, recentCash } from '../services/cashService.js';

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

      const notRecorded = [
        'Account is not active',
        'Insufficient balance',
        'Deposit exceeds supported balance'
      ].includes(message);

      const status =
        message === 'Cash permission denied'
          ? 403
          : message === 'Account not found'
            ? 404
            : 409;

      return res.status(status).json({
        error: message,
        ...(notRecorded
          ? { code: 'CASH_NOT_RECORDED' }
          : {})
      });
    }

    if (
      ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']
        .includes(error.code)
    ) {
      return res.status(409).json({
        error: 'Operation interrupted. Retry the saved request.'
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

export async function requireCashAccess(req, res, next) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        fn_has_permission(
          ${req.user.id}, 'CASH_DEPOSIT'
        ) AS deposit,
        fn_has_permission(
          ${req.user.id}, 'CASH_WITHDRAW'
        ) AS withdraw,
        fn_has_permission(
          ${req.user.id}, 'VIEW_PERSONAL_INFO'
        ) AS personal
    `;

    req.cashPermissions = {
      deposit: Number(rows[0].deposit) === 1,
      withdraw: Number(rows[0].withdraw) === 1,
      personal: Number(rows[0].personal) === 1
    };

    if (
      !req.cashPermissions.deposit &&
      !req.cashPermissions.withdraw
    ) {
      return res.status(403).json({
        error: 'Cash counter access denied'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

export const getCashAccount = endpoint(async (req, res) => {
  const personal = req.cashPermissions.personal;

  const row = await prisma.account.findFirst({
    where: {
      acc_no: accountNumber(req.params.accNo),

      ...(
        req.employeeScope.allBranches
          ? {}
          : {
              branch_ifsc:
                req.employeeScope.branchIfsc
            }
      )
    },

    select: {
      acc_no: true,
      balance: true,
      status: true,

      branch: {
        select: {
          branch_name: true,
          ifsc_code: true
        }
      },

      account_type: {
        select: { type_name: true }
      },

      ...(personal
        ? { customer: { select: { name: true } } }
        : {})
    }
  });

  if (!row) fail(404, 'Account not found');

  res.json({
    account: {
      accountNumber: String(row.acc_no),
      balance: row.balance.toString(),
      status: row.status,
      branchName: row.branch.branch_name,
      branchIfsc: row.branch.ifsc_code,
      accountType: row.account_type.type_name,

      ...(personal
        ? { customerName: row.customer.name }
        : {})
    }
  });
});

export const createCashOperation = endpoint(async (req, res) => {
  const body = req.body ?? {};
  const accNo = String(accountNumber(body.accountNumber));

  if (!['DEPOSIT', 'WITHDRAWAL'].includes(body.kind)) {
    fail(400, 'Invalid cash operation');
  }

  const permitted = body.kind === 'DEPOSIT'
    ? req.cashPermissions.deposit
    : req.cashPermissions.withdraw;

  if (!permitted) fail(403, 'Cash permission denied');

  if (
    typeof body.amount !== 'string' ||
    !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(body.amount) ||
    /^0(?:\.0{1,2})?$/.test(body.amount)
  ) {
    fail(400, 'Enter a positive amount with up to two decimal places');
  }

  const remarks = body.remarks ?? '';

  if (
    typeof remarks !== 'string' ||
    remarks.length > 255
  ) {
    fail(400, 'Remarks must not exceed 255 characters');
  }

  if (
    typeof body.idempotencyKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(body.idempotencyKey)
  ) {
    fail(400, 'A valid request key is required');
  }

  const result = await recordCash({
    employeeId: req.user.id,
    accNo,
    kind: body.kind,
    amount: body.amount,
    remarks: remarks.trim(),
    idempotencyKey: body.idempotencyKey
  });

  res.status(201).json({ receipt: result });
});

export const getRecentCash = endpoint(async (req, res) => {
  res.json({
    receipts: await recentCash({
      employeeId: req.user.id,
      scope: req.employeeScope,
      permissions: req.cashPermissions
    })
  });
});