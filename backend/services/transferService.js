import mysql from 'mysql2/promise';
import { verifyTransferPin } from './transactionPinService.js';

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

const invalid = message => Object.assign(new Error(message), { status: 400 });

function matchesRequest(row, { fromAccNo, toAccNo, amount, remarks }) {
  return String(row.from_acc_no) === fromAccNo
    && String(row.to_acc_no) === toAccNo
    && Number(row.amount) === Number(amount)
    && (row.remarks || '') === remarks;
}

export async function transferMoney(request) {
  const { customerId, fromAccNo, toAccNo, amount, remarks, transactionPin, idempotencyKey } = request;
  await verifyTransferPin({ customerId, accNo: fromAccNo, transactionPin });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      'SELECT trans_id, from_acc_no, to_acc_no, amount, remarks FROM bank_transaction WHERE reference_no = ? FOR UPDATE',
      [idempotencyKey]
    );
    if (existing.length) {
      if (!matchesRequest(existing[0], request)) throw invalid('Idempotency key reused with different transfer details');
      await connection.commit();
      return { transactionId: String(existing[0].trans_id) };
    }

    // Lock accounts in a consistent order to reduce deadlocks between opposite transfers.
    const accountNumbers = [fromAccNo, toAccNo].sort((left, right) => BigInt(left) < BigInt(right) ? -1 : 1);
    const [accounts] = await connection.execute(
      'SELECT acc_no, cust_id, status FROM account WHERE acc_no IN (?, ?) ORDER BY acc_no FOR UPDATE',
      accountNumbers
    );
    const sender = accounts.find(account => String(account.acc_no) === fromAccNo);
    const recipient = accounts.find(account => String(account.acc_no) === toAccNo);

    if (!sender || Number(sender.cust_id) !== Number(customerId)) throw invalid('You can only send credits from your own account');
    if (!recipient) throw invalid('Recipient account not found');
    if (sender.status !== 'ACTIVE' || recipient.status !== 'ACTIVE') throw invalid('Both accounts must be active');

    const [debit] = await connection.execute(
      'UPDATE account SET balance = balance - ? WHERE acc_no = ? AND balance >= ?',
      [amount, fromAccNo, amount]
    );
    if (debit.affectedRows !== 1) throw invalid('Insufficient balance');
    await connection.execute(
      'UPDATE account SET balance = balance + ? WHERE acc_no = ?',
      [amount, toAccNo]
    );
    const [insert] = await connection.execute(
      `INSERT INTO bank_transaction
       (reference_no, from_acc_no, to_acc_no, trans_type, trans_mode, amount, trans_status, remarks)
       VALUES (?, ?, ?, 'TRANSFER', 'INTERNAL', ?, 'SUCCESS', ?)`,
      [idempotencyKey, fromAccNo, toAccNo, amount, remarks]
    );
    await connection.execute(
      `INSERT INTO internal_payment_attempt
       (reference_no, customer_id, from_acc_no, to_acc_no, amount, status, transaction_id)
       VALUES (?, ?, ?, ?, ?, 'DONE', ?)`,
      [idempotencyKey, customerId, fromAccNo, toAccNo, amount, insert.insertId]
    );
    await connection.commit();
    return { transactionId: String(insert.insertId) };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      // A concurrent request may have inserted the same reference while this one waited.
      const [existing] = await connection.execute(
        'SELECT trans_id, from_acc_no, to_acc_no, amount, remarks FROM bank_transaction WHERE reference_no = ?',
        [idempotencyKey]
      );
      if (existing.length) {
        if (!matchesRequest(existing[0], request)) throw invalid('Idempotency key reused with different transfer details');
        return { transactionId: String(existing[0].trans_id) };
      }
    }
    if (error.code === 'ER_LOCK_DEADLOCK') throw invalid('Transfer was interrupted; try again');
    throw error;
  } finally {
    connection.release();
  }
}

export async function recordFailedTransfer({ customerId, fromAccNo, toAccNo, amount, idempotencyKey, reason }) {
  await pool.execute(
    `INSERT INTO internal_payment_attempt
     (reference_no, customer_id, from_acc_no, to_acc_no, amount, status, failure_reason)
     VALUES (?, ?, ?, ?, ?, 'FAILED', ?)`,
    [idempotencyKey, customerId, fromAccNo, toAccNo, amount, String(reason).slice(0, 255)]
  );
}
