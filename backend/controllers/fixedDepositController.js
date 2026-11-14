
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

// ---------------------------------------------
// VALIDATION HELPERS
// ---------------------------------------------

const validId = (value) =>
  /^[1-9]\d*$/.test(String(value)) &&
  Number.isSafeInteger(Number(value));

const validAccount = (value) =>
  typeof value === 'string' &&
  /^[1-9]\d{0,19}$/.test(value) &&
  BigInt(value) <= 18446744073709551615n;

const validAmount = (value) =>
  typeof value === 'string' &&
  /^[1-9]\d{0,12}(\.\d{1,2})?$/.test(value) &&
  new Prisma.Decimal(value).lte('9999999999999.99');

const validRate = (value) =>
  typeof value === 'string' &&
  /^(?:0\.\d{1,2}|[1-9]\d?(?:\.\d{1,2})?)$/.test(value) &&
  new Prisma.Decimal(value).gt(0) &&
  new Prisma.Decimal(value).lte('99.99');

const validMonths = (value) =>
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 120;

// ---------------------------------------------
// FORMAT HELPERS
// ---------------------------------------------

const dateOnly = (value) =>
  value?.toISOString().slice(0, 10) ?? null;

const money = (value) =>
  value == null ? null : value.toString();

const addMonths = (date, months) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();

  const lastDay = new Date(
    Date.UTC(year, month + 1, 0)
  ).getUTCDate();

  return new Date(
    Date.UTC(year, month, Math.min(day, lastDay))
  );
};

const formatFD = (fd) => {
  const interest = new Prisma.Decimal(fd.amount)
    .mul(fd.int_rate_fd)
    .mul(fd.duration_months)
    .div(1200)
    .toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP
    );

  const maturityAmount =
    new Prisma.Decimal(fd.amount).plus(interest);

  return {
    fdId: fd.fd_id,
    customerId: fd.cust_id,
    branchIfsc: fd.branch_ifsc,
    linkedAccount: fd.linked_acc_no.toString(),
    principalAmount: money(fd.amount),
    interestRate: money(fd.int_rate_fd),
    durationMonths: fd.duration_months,
    startDate: dateOnly(fd.start_date),
    maturityDate: dateOnly(
      addMonths(fd.start_date, fd.duration_months)
    ),
    estimatedInterest: interest.toFixed(2),
    estimatedMaturityAmount: maturityAmount.toFixed(2),
    payoutType: fd.payout_type,
    status: fd.status
  };
};

// ---------------------------------------------
// EMPLOYEE BRANCH AUTHORIZATION
// ---------------------------------------------

const canAccessBranch = async (empId, branchIfsc) => {
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
    return false;
  }

  const rows = await prisma.$queryRaw`
    SELECT fn_has_permission(
      ${empId},
      ${'ACCESS_ALL_BRANCHES'}
    ) AS allowed
  `;

  const allBranches = Number(rows[0]?.allowed) === 1;

  return (
    allBranches ||
    employee.branch_ifsc === branchIfsc
  );
};

// ---------------------------------------------
// 1. CREATE FIXED DEPOSIT
// POST /api/employee/fixed-deposits
// ---------------------------------------------

export const createFixedDeposit = wrap(async (req, res) => {
  const empId = req.user.id;

  const {
    customerId,
    accountNumber,
    amount,
    interestRate,
    durationMonths
  } = req.body ?? {};

  if (
    !validId(customerId) ||
    !validAccount(accountNumber) ||
    !validAmount(amount) ||
    !validRate(interestRate) ||
    !validMonths(durationMonths)
  ) {
    return res.status(400).json({
      error: 'Invalid customerId, accountNumber, amount, interestRate or durationMonths'
    });
  }

  // Account must belong to the given customer.
  const account = await prisma.account.findFirst({
    where: {
      acc_no: BigInt(accountNumber),
      cust_id: Number(customerId)
    },
    select: {
      branch_ifsc: true,
      status: true,
      balance: true
    }
  });

  if (!account) {
    return res.status(404).json({
      error: 'Customer account not found'
    });
  }

  const allowed = await canAccessBranch(
    empId,
    account.branch_ifsc
  );

  if (!allowed) {
    return res.status(403).json({
      error: 'Outside permitted branch'
    });
  }

  if (account.status !== 'ACTIVE') {
    return res.status(409).json({
      error: 'Account is not active'
    });
  }

  if (account.balance.lt(amount)) {
    return res.status(409).json({
      error: 'Insufficient account balance'
    });
  }

  // MySQL procedure performs the actual transaction.
  // It rechecks ownership, KYC and balance.
  try {
    await prisma.$executeRaw`
      CALL sp_create_fd(
        ${empId},
        ${Number(customerId)},
        ${BigInt(accountNumber)},
        ${new Prisma.Decimal(amount)},
        ${new Prisma.Decimal(interestRate)},
        ${durationMonths},
        @created_fd_id
      )
    `;
  } catch (err) {
    if (err.code === 'P2010') {
      return res.status(409).json({
        error: 'FD creation rejected by database'
      });
    }

    throw err;
  }

  return res.status(201).json({
    message: 'Fixed deposit created successfully',
    customerId: Number(customerId),
    linkedAccount: accountNumber,
    principalAmount: new Prisma.Decimal(amount).toFixed(2),
    interestRate,
    durationMonths
  });
});

// ---------------------------------------------
// 2. LIST CUSTOMER FIXED DEPOSITS
// GET /api/customer/fixed-deposits
// ---------------------------------------------

export const getMyFixedDeposits = wrap(async (req, res) => {
  const fixedDeposits =
    await prisma.fixed_deposit.findMany({
      where: {
        cust_id: req.user.id
      },
      orderBy: {
        fd_id: 'desc'
      }
    });

  return res.json({
    totalFixedDeposits: fixedDeposits.length,
    fixedDeposits: fixedDeposits.map(formatFD)
  });
});

// ---------------------------------------------
// 3. VIEW SPECIFIC FD
// GET /api/customer/fixed-deposits/:fdId
// ---------------------------------------------

export const getFixedDepositDetails = wrap(
  async (req, res) => {
    if (!validId(req.params.fdId)) {
      return res.status(400).json({
        error: 'Invalid FD ID'
      });
    }

    const fd = await prisma.fixed_deposit.findFirst({
      where: {
        fd_id: Number(req.params.fdId),
        cust_id: req.user.id
      }
    });

    if (!fd) {
      return res.status(404).json({
        error: 'Fixed deposit not found'
      });
    }

    return res.json({
      fixedDeposit: formatFD(fd)
    });
  }
);

// ---------------------------------------------
// 4. VIEW FD PAYOUT HISTORY
// GET /api/customer/fixed-deposits/:fdId/payouts
// ---------------------------------------------

export const getFdPayouts = wrap(async (req, res) => {
  if (!validId(req.params.fdId)) {
    return res.status(400).json({
      error: 'Invalid FD ID'
    });
  }

  // Verify ownership before exposing payout records.
  const fd = await prisma.fixed_deposit.findFirst({
    where: {
      fd_id: Number(req.params.fdId),
      cust_id: req.user.id
    },
    select: {
      fd_id: true
    }
  });

  if (!fd) {
    return res.status(404).json({
      error: 'Fixed deposit not found'
    });
  }

  const payouts = await prisma.fd_payout.findMany({
    where: {
      fd_id: fd.fd_id
    },
    orderBy: {
      payout_id: 'desc'
    }
  });

  return res.json({
    fdId: fd.fd_id,
    payouts: payouts.map((p) => ({
      payoutId: p.payout_id,
      payoutType: p.payout_kind,
      payoutDate: dateOnly(p.payout_date),
      amount: money(p.amount),
      transactionId: money(p.credited_trans_id)
    }))
  });
});

// ---------------------------------------------
// 5. MATURE FIXED DEPOSIT
// POST /api/employee/fixed-deposits/:fdId/mature
// ---------------------------------------------

export const matureFixedDeposit = wrap(
  async (req, res) => {
    if (!validId(req.params.fdId)) {
      return res.status(400).json({
        error: 'Invalid FD ID'
      });
    }

    const fdId = Number(req.params.fdId);
    const empId = req.user.id;

    const fd = await prisma.fixed_deposit.findUnique({
      where: {
        fd_id: fdId
      }
    });

    if (!fd) {
      return res.status(404).json({
        error: 'Fixed deposit not found'
      });
    }

    const allowed = await canAccessBranch(
      empId,
      fd.branch_ifsc
    );

    if (!allowed) {
      return res.status(403).json({
        error: 'Outside permitted branch'
      });
    }

    if (fd.status !== 'ACTIVE') {
      return res.status(409).json({
        error: 'FD is not active'
      });
    }

    const maturityDate = addMonths(
      fd.start_date,
      fd.duration_months
    );

    if (new Date() < maturityDate) {
      return res.status(409).json({
        error: 'FD has not reached maturity date'
      });
    }

    // Database procedure credits principal + interest,
    // inserts transaction/payout and marks FD as MATURED.
    try {
      await prisma.$executeRaw`
        CALL sp_mature_fd(
          ${empId},
          ${fdId},
          @maturity_trans_id
        )
      `;
    } catch (err) {
      if (err.code === 'P2010') {
        return res.status(409).json({
          error: 'FD maturity rejected by database'
        });
      }

      throw err;
    }

    const updated = await prisma.fixed_deposit.findUnique({
      where: {
        fd_id: fdId
      }
    });

    return res.json({
      message: 'Fixed deposit matured successfully',
      fixedDeposit: formatFD(updated)
    });
  }
);
