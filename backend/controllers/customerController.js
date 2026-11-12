import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

export const getMyAccounts = wrap(async (req, res) => {
  const custId = req.user.id;

  const accounts = await prisma.account.findMany({
    where: {
      cust_id: custId
    },
    select: {
      acc_no: true,
      balance: true,
      status: true,
      is_primary: true,
      creation_date: true,
      account_type: {
        select: {
          type_name: true
        }
      },
      branch: {
        select: {
          branch_name: true,
          ifsc_code: true
        }
      }
    },
    orderBy: {
      acc_no: 'asc'
    }
  });

  res.json({
    totalAccounts: accounts.length,
    accounts: accounts.map(account => ({
      accountNumber: account.acc_no.toString(),
      balance: account.balance.toString(),
      status: account.status,
      isPrimary: account.is_primary,
      openingDate: account.creation_date,
      accountType: account.account_type.type_name,
      branchName: account.branch.branch_name,
      ifscCode: account.branch.ifsc_code
    }))
  });
});

export const getAccountTransactions = wrap(async (req, res) => {
  const custId = req.user.id;
  const { accNo } = req.params;

  // 1. Validate account number
  if (!/^\d{6,20}$/.test(accNo)) {
    return res.status(400).json({
      error: 'Invalid account number'
    });
  }

  const accountNumber = BigInt(accNo);

  // 2. Verify account ownership
  const account = await prisma.account.findFirst({
    where: {
      acc_no: accountNumber,
      cust_id: custId
    },
    select: {
      acc_no: true
    }
  });

  if (!account) {
    return res.status(404).json({
      error: 'Account not found'
    });
  }

  // 3. Pagination
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);

  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 100 ||
    (page - 1) * limit > 100000
  ) {
    return res.status(400).json({
      error: 'Invalid pagination parameters'
    });
  }

  const offset = (page - 1) * limit;

  // 4. Fetch history from the existing MySQL view
  const transactions = await prisma.$queryRaw`
    SELECT
      trans_id,
      reference_no,
      trans_date,
      trans_type,
      trans_mode,
      amount,
      trans_status,
      remarks,
      direction,
      counterparty_acc_no
    FROM v_transaction_history
    WHERE acc_no = ${accountNumber}
    ORDER BY trans_date DESC, trans_id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // 5. Count transactions for pagination
  const countRows = await prisma.$queryRaw`
    SELECT COUNT(*) AS total
    FROM v_transaction_history
    WHERE acc_no = ${accountNumber}
  `;

  const total = Number(countRows[0].total);

  const failedPayments = await prisma.$queryRaw`
    SELECT attempt_id, reference_no, to_acc_no, amount, failure_reason, created_at
    FROM internal_payment_attempt
    WHERE from_acc_no = ${accNo} AND customer_id = ${custId} AND status = 'FAILED'
    ORDER BY created_at DESC, attempt_id DESC
    LIMIT 10
  `;

  // 6. Return formatted response
  res.json({
    accountNumber: accNo,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    failedPayments: failedPayments.map(payment => ({
      attemptId: payment.attempt_id.toString(),
      referenceNumber: payment.reference_no,
      recipientAccount: payment.to_acc_no,
      amount: payment.amount.toString(),
      status: 'FAILED',
      reason: payment.failure_reason,
      date: payment.created_at
    })),
    transactions: transactions.map(t => ({
      transactionId: t.trans_id.toString(),
      referenceNumber: t.reference_no,
      date: t.trans_date,
      type: t.trans_type,
      mode: t.trans_mode,
      amount: t.amount.toString(),
      status: t.trans_status,
      direction: t.direction,
      counterpartyAccount: t.counterparty_acc_no?.toString() ?? null,
      remarks: t.remarks
    }))
  });
});
