import mysql from 'mysql2/promise';

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
  remarks
}) {
  const connection = await pool.getConnection();

  try {
    await connection.query(
      `CALL sp_transfer(?, ?, ?, ?, ?, ?, @transfer_id)`,
      [
        customerId,
        fromAccNo,
        toAccNo,
        amount,
        'IMPS',
        remarks
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