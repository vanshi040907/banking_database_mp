
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

// Validate account numbers stored as BIGINT UNSIGNED
const validAccount = (value) =>
  typeof value === 'string' &&
  /^[1-9]\d{0,19}$/.test(value) &&
  BigInt(value) <= 18446744073709551615n;

// MySQL DECIMAL(15,2): at most 13 integer digits
const validAmount = (value) =>
  typeof value === 'string' &&
  /^[1-9]\d{0,12}(\.\d{1,2})?$/.test(value) &&
  new Prisma.Decimal(value).lessThanOrEqualTo(
    '9999999999999.99'
  );

// POST /api/employee/deposits
export const createCashDeposit = wrap(async (req, res) => {
  const empId = req.user.id;

  const {
    accountNumber,
    amount,
    remarks
  } = req.body ?? {};

  // 1. Validate request
  if (
    !validAccount(accountNumber) ||
    !validAmount(amount) ||
    (remarks !== undefined &&
      (typeof remarks !== 'string' ||
       remarks.length > 255))
  ) {
    return res.status(400).json({
      error: 'Provide a valid accountNumber, positive amount (string), and optional remarks'
    });
  }

  // 2. Get logged-in employee
  const employee = await prisma.employee.findUnique({
    where: {
      emp_id: empId
    },
    select: {
      branch_ifsc: true,
      status: true
    }
  });

  if (!employee || employee.status !== 'ACTIVE') {
    return res.status(403).json({
      error: 'Employee is not active'
    });
  }

  // 3. Find target account
  const account = await prisma.account.findUnique({
    where: {
      acc_no: BigInt(accountNumber)
    },
    select: {
      acc_no: true,
      branch_ifsc: true,
      status: true
    }
  });

  if (!account) {
    return res.status(404).json({
      error: 'Account not found'
    });
  }

  if (account.status !== 'ACTIVE') {
    return res.status(409).json({
      error: 'Account is not active'
    });
  }

  // 4. Enforce employee branch access
  const rows = await prisma.$queryRaw`
    SELECT fn_has_permission(
      ${empId},
      ${'ACCESS_ALL_BRANCHES'}
    ) AS allowed
  `;

  const canAccessAllBranches =
    Number(rows[0]?.allowed) === 1;

  if (
    !canAccessAllBranches &&
    employee.branch_ifsc !== account.branch_ifsc
  ) {
    return res.status(403).json({
      error: 'Cannot deposit into an account outside your branch'
    });
  }

  // 5. Let MySQL handle the actual deposit
  //
  // sp_cash_deposit:
  // - checks CASH_DEPOSIT permission
  // - locks the account row
  // - increases account balance
  // - creates a bank_transaction record
  // - commits everything atomically

  try {
    await prisma.$executeRaw`
      CALL sp_cash_deposit(
        ${empId},
        ${BigInt(accountNumber)},
        ${new Prisma.Decimal(amount)},
        ${remarks?.trim() || 'Branch cash deposit'},
        @deposit_trans_id
      )
    `;
  } catch (err) {
    // MySQL stored procedure rejected the operation
    if (err.code === 'P2010') {
      return res.status(409).json({
        error: 'Cash deposit rejected by database'
      });
    }

    throw err;
  }

  // Return confirmation.
  // Transaction ID will be retrieved through the
  // receipt/history API, not from a different DB session.
  return res.status(201).json({
    message: 'Cash deposit processed successfully',
    accountNumber,
    amount: new Prisma.Decimal(amount).toFixed(2),
    branchIfsc: account.branch_ifsc
  });
});


// --------------------------------------------------
// HELPER: Find the logged-in employee's branch
// --------------------------------------------------
const getEmployeeBranch = async (empId) => {
  const employee = await prisma.employee.findUnique({
    where: {
      emp_id: empId
    },
    select: {
      branch_ifsc: true,
      status: true
    }
  });

  if (!employee || employee.status !== 'ACTIVE') {
    return null;
  }

  return employee.branch_ifsc;
};

// Convert database values into JSON-safe values
const formatDeposit = (row) => ({
  transactionId: row.trans_id.toString(),
  referenceNumber: row.reference_no,
  accountNumber: row.to_acc_no.toString(),
  amount: row.amount.toString(),
  transactionDate: row.trans_date,
  status: row.trans_status,
  mode: row.trans_mode,
  employeeId: row.initiated_by,
  remarks: row.remarks
});

// --------------------------------------------------
// 1. VIEW BRANCH CASH DEPOSIT HISTORY
// GET /api/employee/deposits
// --------------------------------------------------
export const getBranchDeposits = wrap(async (req, res) => {
  const branchIfsc = await getEmployeeBranch(req.user.id);

  if (!branchIfsc) {
    return res.status(403).json({
      error: 'Employee not found or inactive'
    });
  }

  const page = Number(req.query.page ?? 1);

  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) {
    return res.status(400).json({
      error: 'Invalid page number'
    });
  }

  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  // Only show CASH deposits associated with this branch.
  const deposits = await prisma.$queryRaw`
    SELECT
      t.trans_id,
      t.reference_no,
      t.to_acc_no,
      t.amount,
      t.trans_date,
      t.trans_status,
      t.trans_mode,
      t.initiated_by,
      t.remarks
    FROM bank_transaction t
    JOIN account a
      ON a.acc_no = t.to_acc_no
    WHERE
      a.branch_ifsc = ${branchIfsc}
      AND t.trans_type = 'DEPOSIT'
      AND t.trans_mode = 'CASH'
    ORDER BY t.trans_date DESC, t.trans_id DESC
    LIMIT ${pageSize}
    OFFSET ${skip}
  `;

  res.json({
    branchIfsc,
    page,
    pageSize,
    deposits: deposits.map(formatDeposit)
  });
});

// --------------------------------------------------
// 2. VIEW CASH DEPOSIT RECEIPT
// GET /api/employee/deposits/:transId
// --------------------------------------------------
export const getDepositReceipt = wrap(async (req, res) => {
  const transactionId = String(req.params.transId);

  if (
    !/^[1-9]\d*$/.test(transactionId) ||
    BigInt(transactionId) > 9223372036854775807n
  ) {
    return res.status(400).json({
      error: 'Invalid transaction ID'
    });
  }

  const branchIfsc = await getEmployeeBranch(req.user.id);

  if (!branchIfsc) {
    return res.status(403).json({
      error: 'Employee not found or inactive'
    });
  }

  const rows = await prisma.$queryRaw`
    SELECT
      t.trans_id,
      t.reference_no,
      t.to_acc_no,
      t.amount,
      t.trans_date,
      t.trans_status,
      t.trans_mode,
      t.initiated_by,
      t.remarks,
      b.branch_name
    FROM bank_transaction t
    JOIN account a
      ON a.acc_no = t.to_acc_no
    JOIN branch b
      ON b.ifsc_code = a.branch_ifsc
    WHERE
      t.trans_id = ${BigInt(transactionId)}
      AND a.branch_ifsc = ${branchIfsc}
      AND t.trans_type = 'DEPOSIT'
      AND t.trans_mode = 'CASH'
    LIMIT 1
  `;

  if (rows.length === 0) {
    return res.status(404).json({
      error: 'Cash deposit receipt not found'
    });
  }

  const deposit = rows[0];

  res.json({
    receipt: {
      ...formatDeposit(deposit),
      branchName: deposit.branch_name,
      branchIfsc
    }
  });
});

// --------------------------------------------------
// 3. BRANCH CASH DEPOSIT SUMMARY
// GET /api/employee/deposits/summary
// --------------------------------------------------
export const getBranchDepositSummary = wrap(async (req, res) => {
  const branchIfsc = await getEmployeeBranch(req.user.id);

  if (!branchIfsc) {
    return res.status(403).json({
      error: 'Employee not found or inactive'
    });
  }

  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) AS total_count,

      COALESCE(SUM(t.amount), 0) AS total_amount,

      COALESCE(
        SUM(
          CASE
            WHEN DATE(t.trans_date) = CURRENT_DATE()
            THEN 1
            ELSE 0
          END
        ), 0
      ) AS today_count,

      COALESCE(
        SUM(
          CASE
            WHEN DATE(t.trans_date) = CURRENT_DATE()
            THEN t.amount
            ELSE 0
          END
        ), 0
      ) AS today_amount

    FROM bank_transaction t
    JOIN account a
      ON a.acc_no = t.to_acc_no

    WHERE
      a.branch_ifsc = ${branchIfsc}
      AND t.trans_type = 'DEPOSIT'
      AND t.trans_mode = 'CASH'
      AND t.trans_status = 'SUCCESS'
  `;

  const summary = rows[0];

  res.json({
    branchIfsc,
    totalDeposits: summary.total_count.toString(),
    totalAmount: summary.total_amount.toString(),
    todayDeposits: summary.today_count.toString(),
    todayAmount: summary.today_amount.toString()
  });
});


// --------------------------------------------
// CUSTOMER CASH DEPOSIT HISTORY
// GET /api/customer/deposits
// --------------------------------------------

export const getMyDeposits = wrap(async (req, res) => {
  const custId = req.user.id;

  const deposits = await prisma.$queryRaw`
    SELECT
      t.trans_id,
      t.reference_no,
      t.to_acc_no,
      t.amount,
      t.trans_date,
      t.trans_status,
      t.trans_mode,
      t.initiated_by,
      t.remarks
    FROM bank_transaction t
    JOIN account a
      ON a.acc_no = t.to_acc_no
    WHERE
      a.cust_id = ${custId}
      AND t.trans_type = 'DEPOSIT'
      AND t.trans_mode = 'CASH'
    ORDER BY t.trans_date DESC, t.trans_id DESC
    LIMIT 100
  `;

  return res.json({
    totalDeposits: deposits.length,
    deposits: deposits.map(formatDeposit)
  });
});