
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

// Validate database IDs
const validId = (v) =>
  /^[1-9]\d*$/.test(String(v)) &&
  Number.isSafeInteger(Number(v));

// Validate BIGINT account numbers
const validAccount = (v) =>
  typeof v === 'string' &&
  /^[1-9]\d{0,19}$/.test(v) &&
  BigInt(v) <= 18446744073709551615n;

// Financial calculations
const D = (value) => new Prisma.Decimal(value);

const cents = (value) =>
  value.toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP
  );

// Add calendar months to a date
const dateAddMonths = (d, n) => {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();

  const last = new Date(
    Date.UTC(y, m + 1, 0)
  ).getUTCDate();

  return new Date(
    Date.UTC(y, m, Math.min(day, last))
  );
};

// Check whether employee can access loan's branch
const scopedEmployee = async (empId, branchIfsc) => {
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

  const canAccessAllBranches =
    Number(rows[0]?.allowed) === 1;

  return (
    employee.branch_ifsc === branchIfsc ||
    canAccessAllBranches
  );
};

// ----------------------------------------------------
// 1. CREATE EMI SCHEDULE
// POST /api/employee/loans/:loanId/schedule
// ----------------------------------------------------

export const createEmiSchedule = wrap(async (req, res) => {
  if (!validId(req.params.loanId)) {
    return res.status(400).json({
      error: 'Invalid loan ID'
    });
  }

  const loan = await prisma.loan.findUnique({
    where: {
      loan_id: Number(req.params.loanId)
    }
  });

  if (!loan) {
    return res.status(404).json({
      error: 'Loan not found'
    });
  }

  const allowed = await scopedEmployee(
    req.user.id,
    loan.branch_ifsc
  );

  if (!allowed) {
    return res.status(403).json({
      error: 'Outside permitted branch'
    });
  }

  if (loan.status !== 'PENDING') {
    return res.status(409).json({
      error: 'Only pending loans can be scheduled'
    });
  }

  const count = loan.tenure_months;

  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 360
  ) {
    return res.status(400).json({
      error: 'Invalid loan tenure'
    });
  }

  // Monthly amortization calculation
  const principal = D(loan.principle_amt);
  const rate = D(loan.int_rate).div(1200);

  const factor = D(1).plus(rate).pow(count);

  const installment = rate.isZero()
    ? cents(principal.div(count))
    : cents(
        principal
          .mul(rate)
          .mul(factor)
          .div(factor.minus(1))
      );

  let remaining = principal;

  const anchor = new Date();
  anchor.setUTCHours(0, 0, 0, 0);

  const schedule = [];

  for (let i = 1; i <= count; i++) {
    const interest = cents(
      remaining.mul(rate)
    );

    const principalPart =
      i === count
        ? remaining
        : Prisma.Decimal.min(
            remaining,
            installment.minus(interest)
          );

    if (principalPart.lessThanOrEqualTo(0)) {
      return res.status(400).json({
        error: 'Loan schedule cannot amortize'
      });
    }

    const amount = cents(
      principalPart.plus(interest)
    );

    schedule.push({
      loan_id: loan.loan_id,
      installment_no: i,
      due_date: dateAddMonths(anchor, i),
      emi_amount: amount,
      principal_part: principalPart,
      interest_part: interest,
      status: 'PENDING'
    });

    remaining = remaining.minus(principalPart);
  }

  // Create all EMIs together in one transaction
  try {
    await prisma.$transaction(async (tx) => {
      const existing =
        await tx.loan_emi_schedule.count({
          where: {
            loan_id: loan.loan_id
          }
        });

      if (existing > 0) {
        const err = new Error(
          'Schedule already exists'
        );
        err.status = 409;
        throw err;
      }

      await tx.loan_emi_schedule.createMany({
        data: schedule
      });

      await tx.audit_log.create({
        data: {
          emp_id: req.user.id,
          action: 'LOAN_SCHEDULE',
          table_name: 'loan',
          record_id: String(loan.loan_id),
          details: `Created ${count} EMI installments`
        }
      });
    });
  } catch (err) {
    if (
      err.status === 409 ||
      err.code === 'P2002'
    ) {
      return res.status(409).json({
        error: 'Schedule already exists'
      });
    }

    throw err;
  }

  return res.status(201).json({
    message: 'EMI schedule created',
    loanId: loan.loan_id,
    installments: count
  });
});

// ----------------------------------------------------
// 2. APPROVE AND DISBURSE LOAN
// POST /api/employee/loans/:loanId/disburse
// ----------------------------------------------------

export const disburseLoan = wrap(async (req, res) => {
  const { accountNumber } = req.body ?? {};

  if (
    !validId(req.params.loanId) ||
    !validAccount(accountNumber)
  ) {
    return res.status(400).json({
      error: 'Invalid loan ID or account number'
    });
  }

  const loan = await prisma.loan.findUnique({
    where: {
      loan_id: Number(req.params.loanId)
    }
  });

  if (!loan) {
    return res.status(404).json({
      error: 'Loan not found'
    });
  }

  const allowed = await scopedEmployee(
    req.user.id,
    loan.branch_ifsc
  );

  if (!allowed) {
    return res.status(403).json({
      error: 'Outside permitted branch'
    });
  }

  if (loan.status !== 'PENDING') {
    return res.status(409).json({
      error: 'Loan is not pending'
    });
  }

  // Require a complete EMI schedule
  const installments =
    await prisma.loan_emi_schedule.count({
      where: {
        loan_id: loan.loan_id
      }
    });

  if (installments !== loan.tenure_months) {
    return res.status(409).json({
      error: 'Create complete EMI schedule before disbursement'
    });
  }

  // Ensure the receiving account belongs to customer
  const account = await prisma.account.findFirst({
    where: {
      acc_no: BigInt(accountNumber),
      cust_id: loan.cust_id,
      branch_ifsc: loan.branch_ifsc,
      status: 'ACTIVE'
    }
  });

  if (!account) {
    return res.status(400).json({
      error: 'Disbursement account invalid'
    });
  }

  // Reuse existing database stored procedure
  try {
    await prisma.$executeRaw`
      CALL sp_disburse_loan(
        ${req.user.id},
        ${loan.loan_id},
        ${BigInt(accountNumber)},
        @loan_trans_id
      )
    `;
  } catch (err) {
    if (err.code === 'P2010') {
      return res.status(409).json({
        error: 'Loan disbursement rejected by database'
      });
    }

    throw err;
  }

  const updated = await prisma.loan.findUnique({
    where: {
      loan_id: loan.loan_id
    }
  });

  return res.json({
    message: 'Loan disbursed successfully',
    loanId: loan.loan_id,
    status: updated.status,
    outstandingAmount:
      updated.outstanding_amount.toString(),
    accountNumber:
      updated.disbursed_acc_no.toString()
  });
});
