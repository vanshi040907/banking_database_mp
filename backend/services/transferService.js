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