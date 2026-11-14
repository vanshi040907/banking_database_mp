import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: false,
  supportBigNumbers: true,
  bigNumberStrings: true
});

export async function openCustomerAccount(data) {
  const connection = await pool.getConnection();

  try {
    await connection.query(
      'CALL sp_open_account(?, ?, ?, ?, ?, ?, @opened_account)',
      [
        data.customerId,
        data.branchIfsc,
        data.typeId,
        data.openingAmount,
        data.employeeId,
        data.idempotencyKey
      ]
    );

    const [rows] = await connection.query(
      'SELECT CAST(@opened_account AS CHAR) AS accountNumber'
    );

    if (!rows[0]?.accountNumber) {
      throw new Error('Account result unavailable');
    }

    return rows[0].accountNumber;
  } finally {
    connection.release();
  }
}

export async function setManagedAccountStatus({
  accNo,
  status,
  employeeId,
  reason
}) {
  await pool.query(
    'CALL sp_set_account_status(?, ?, ?, ?)',
    [accNo, status, employeeId, reason]
  );
}

export async function closeManagedAccount({
  accNo,
  employeeId,
  reason
}) {
  await pool.query(
    'CALL sp_close_account(?, ?, ?)',
    [accNo, employeeId, reason]
  );
}