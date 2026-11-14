import mysql from 'mysql2/promise';
import { verifyTransferPin } from './transactionPinService.js';

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: false,
  supportBigNumbers: true,
  bigNumberStrings: true
});

export async function transferMoney({
  customerId,
  fromAccNo,
  toAccNo,
  amount,
  remarks,
  transactionPin,
  idempotencyKey
}) {
  const connection = await pool.getConnection();

  try {
    await verifyTransferPin({
  customerId,
  accNo: fromAccNo,
  transactionPin
    });

    await connection.query(
      `CALL sp_secure_transfer(?, ?, ?, ?, ?, ?, @transfer_id)`,
      [
        customerId,
        fromAccNo,
        toAccNo,
        amount,
        remarks,
        idempotencyKey
      ]
    );

    const [rows] = await connection.query(
      'SELECT @transfer_id AS transactionId'
    );

    return {
      transactionId: String(rows[0].transactionId)
    };
  } finally {
    connection.release();
  }
}

// Remember a rejected transfer so it can be shown in the customer's history.
export async function recordFailedTransfer({ customerId, fromAccNo, toAccNo, amount, idempotencyKey, reason }) {
  try {
    await pool.execute(
      `INSERT INTO failed_transfer_attempt
       (reference_no, customer_id, from_acc_no, to_acc_no, amount, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [idempotencyKey, customerId, fromAccNo, toAccNo, amount, String(reason).slice(0, 255)]
    );
  } catch (e) {
    console.error('Could not record failed transfer:', e.message); // never hide the real error
  }
}
