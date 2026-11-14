
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

const TYPES = Object.freeze({
  HOME: '8.50',
  AUTO: '9.00',
  PERSONAL: '12.00',
  EDUCATION: '8.00',
  BUSINESS: '11.00'
}); // Demo interest rates only

const validId = (v) =>
  /^[1-9]\d*$/.test(String(v)) &&
  Number.isSafeInteger(Number(v));

const validAccount = (v) =>
  typeof v === 'string' &&
  /^[1-9]\d{0,19}$/.test(v) &&
  BigInt(v) <= 18446744073709551615n;

const validAmount = (v) =>
  typeof v === 'string' &&
  /^(?:[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(v) &&
  new Prisma.Decimal(v).lessThanOrEqualTo('9999999999999.99');

const date = (v) =>
  v?.toISOString().slice(0, 10) ?? null;

const money = (v) =>
  v == null ? null : v.toString();

const formatLoan = (l) => ({
  loanId: l.loan_id,
  loanType: l.loantype,
  principalAmount: money(l.principle_amt),
  interestRate: money(l.int_rate),
  tenureMonths: l.tenure_months,
  startDate: date(l.start_date),
  outstandingAmount: money(l.outstanding_amount),
  status: l.status,
  branchIfsc: l.branch_ifsc,
  disbursedAccount: money(l.disbursed_acc_no)
});

// Find a loan belonging to the logged-in customer
const ownLoan = async (custId, loanId) =>
  prisma.loan.findFirst({
    where: {
      loan_id: Number(loanId),
      cust_id: custId
    }
  });

// 1. GET /api/customer/loans
export const getMyLoans = wrap(async (req, res) => {
  const loans = await prisma.loan.findMany({
    where: {
      cust_id: req.user.id
    },
    orderBy: {
      loan_id: 'desc'
    }
  });

  res.json({
    totalLoans: loans.length,
    loans: loans.map(formatLoan)
  });
});

// 2. GET /api/customer/loans/:loanId
export const getLoanDetails = wrap(async (req, res) => {
  if (!validId(req.params.loanId)) {
    return res.status(400).json({
      error: 'Invalid loan ID'
    });
  }

  const loan = await ownLoan(
    req.user.id,
    req.params.loanId
  );

  if (!loan) {
    return res.status(404).json({
      error: 'Loan not found'
    });
  }

  res.json({
    loan: formatLoan(loan)
  });
});

// 3. GET /api/customer/loans/:loanId/emis
export const getLoanEmis = wrap(async (req, res) => {
  if (!validId(req.params.loanId)) {
    return res.status(400).json({
      error: 'Invalid loan ID'
    });
  }

  const loan = await ownLoan(
    req.user.id,
    req.params.loanId
  );

  if (!loan) {
    return res.status(404).json({
      error: 'Loan not found'
    });
  }

  const schedule =
    await prisma.loan_emi_schedule.findMany({
      where: {
        loan_id: loan.loan_id
      },
      orderBy: {
        installment_no: 'asc'
      }
    });

  res.json({
    loanId: loan.loan_id,
    emis: schedule.map((e) => ({
      emiId: e.emi_id,
      installmentNo: e.installment_no,
      dueDate: date(e.due_date),
      amount: money(e.emi_amount),
      principalPart: money(e.principal_part),
      interestPart: money(e.interest_part),
      status: e.status
    }))
  });
});

// 4. GET /api/customer/loans/:loanId/payments
export const getLoanPayments = wrap(async (req, res) => {
  if (!validId(req.params.loanId)) {
    return res.status(400).json({
      error: 'Invalid loan ID'
    });
  }

  const loan = await ownLoan(
    req.user.id,
    req.params.loanId
  );

  if (!loan) {
    return res.status(404).json({
      error: 'Loan not found'
    });
  }

  const rows = await prisma.loan_payment.findMany({
    where: {
      loan_id: loan.loan_id
    },
    orderBy: {
      pay_id: 'desc'
    }
  });

  res.json({
    loanId: loan.loan_id,
    payments: rows.map((p) => ({
      paymentId: p.pay_id,
      emiId: p.emi_id,
      transactionId: money(p.trans_id),
      amount: money(p.amount),
      paymentDate: date(p.pay_date),
      paymentMode: p.pay_mode
    }))
  });
});

// 5. POST /api/customer/loans
export const applyForLoan = wrap(async (req, res) => {
  const {
    accountNumber,
    loanType,
    amount,
    tenureMonths
  } = req.body ?? {};

  if (
    !validAccount(accountNumber) ||
    !Object.hasOwn(TYPES, loanType) ||
    !validAmount(amount) ||
    !Number.isInteger(tenureMonths) ||
    tenureMonths < 1 ||
    tenureMonths > 360
  ) {
    return res.status(400).json({
      error: 'Provide valid accountNumber, loanType, amount (string), tenureMonths (1-360)'
    });
  }

  const account = await prisma.account.findFirst({
    where: {
      acc_no: BigInt(accountNumber),
      cust_id: req.user.id
    },
    select: {
      status: true,
      branch_ifsc: true,
      customer: {
        select: {
          kyc_status: true
        }
      }
    }
  });

  if (!account) {
    return res.status(404).json({
      error: 'Account not found'
    });
  }

  if (
    account.status !== 'ACTIVE' ||
    account.customer.kyc_status !== 'VERIFIED'
  ) {
    return res.status(409).json({
      error: 'Active account and verified KYC required'
    });
  }

  const loan = await prisma.loan.create({
    data: {
      cust_id: req.user.id,
      branch_ifsc: account.branch_ifsc,
      loantype: loanType,
      principle_amt: new Prisma.Decimal(amount),
      int_rate: new Prisma.Decimal(TYPES[loanType]),
      tenure_months: tenureMonths,
      start_date: new Date(),
      outstanding_amount: new Prisma.Decimal('0'),
      status: 'PENDING'
    }
  });

  res.status(201).json({
    message: 'Demo loan application submitted',
    loan: formatLoan(loan)
  });
});

// 6. POST /api/customer/loans/:loanId/pay-emi
export const payLoanEmi = wrap(async (req, res) => {
  const {
    emiId,
    accountNumber
  } = req.body ?? {};

  if (
    !validId(req.params.loanId) ||
    !validId(emiId) ||
    !validAccount(accountNumber)
  ) {
    return res.status(400).json({
      error: 'Invalid loanId, emiId, or accountNumber'
    });
  }

  const loan = await ownLoan(
    req.user.id,
    req.params.loanId
  );

  if (!loan) {
    return res.status(404).json({
      error: 'Loan not found'
    });
  }

  const emi = await prisma.loan_emi_schedule.findFirst({
    where: {
      emi_id: Number(emiId),
      loan_id: loan.loan_id
    }
  });

  if (!emi) {
    return res.status(404).json({
      error: 'EMI not found for this loan'
    });
  }

  if (!['PENDING', 'OVERDUE'].includes(emi.status)) {
    return res.status(409).json({
      error: 'EMI already paid'
    });
  }

  const account = await prisma.account.findFirst({
    where: {
      acc_no: BigInt(accountNumber),
      cust_id: req.user.id
    }
  });

  if (!account || account.status !== 'ACTIVE') {
    return res.status(400).json({
      error: 'Invalid payment account'
    });
  }

  // Existing MySQL procedure handles the payment
  try {
    await prisma.$executeRaw`
      CALL sp_pay_emi(
        ${req.user.id},
        ${Number(emiId)},
        ${BigInt(accountNumber)},
        @loan_trans_id
      )
    `;
  } catch (err) {
    if (err.code === 'P2010') {
      return res.status(409).json({
        error: 'EMI payment rejected by database; check balance and loan status'
      });
    }

    throw err;
  }

  const payment = await prisma.loan_payment.findFirst({
    where: {
      emi_id: Number(emiId),
      loan_id: loan.loan_id
    },
    orderBy: {
      pay_id: 'desc'
    }
  });

  res.json({
    message: 'EMI paid successfully',
    loanId: loan.loan_id,
    emiId: Number(emiId),
    transactionId: money(payment?.trans_id)
  });
});
