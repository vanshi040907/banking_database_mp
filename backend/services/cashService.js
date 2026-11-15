import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: false,
  supportBigNumbers: true,
  bigNumberStrings: true
});

const RECEIPT_QUERY = `
  SELECT
    t.trans_id,
    t.reference_no,
    t.trans_type,
    t.amount,
    t.trans_date,
    r.acc_no,
    r.emp_id,
    r.balance_before,
    r.balance_after,
    a.branch_ifsc,
    b.branch_name
  FROM cash_operation_request r
  JOIN bank_transaction t ON t.trans_id = r.trans_id
  JOIN account a ON a.acc_no = r.acc_no
  JOIN branch b ON b.ifsc_code = a.branch_ifsc
`;

const receipt = row => ({
  transactionId: String(row.trans_id),
  referenceNumber: row.reference_no,
  kind: row.trans_type,
  amount: String(row.amount),
  date: row.trans_date,
  accountNumber: String(row.acc_no),
  employeeId: row.emp_id,
  balanceBefore: String(row.balance_before),
  balanceAfter: String(row.balance_after),
  branchIfsc: row.branch_ifsc,
  branchName: row.branch_name
});

export async function recordCash(data) {
  if (!['DEPOSIT', 'WITHDRAWAL'].includes(data.kind)) {
    throw new Error('Invalid cash operation');
  }

  const sql = data.kind === 'DEPOSIT'
    ? 'CALL sp_cash_deposit(?, ?, ?, ?, ?, @cash_transaction)'
    : 'CALL sp_cash_withdraw(?, ?, ?, ?, ?, @cash_transaction)';

  const connection = await pool.getConnection();

  try {
    await connection.query(sql, [
      data.employeeId,
      data.accNo,
      data.amount,
      data.remarks,
      data.idempotencyKey
    ]);

    const [rows] = await connection.execute(
      RECEIPT_QUERY +
        ' WHERE r.emp_id = ? AND r.request_key = ?',
      [data.employeeId, data.idempotencyKey]
    );

    if (!rows[0]) {
      throw new Error('Cash receipt unavailable');
    }

    return receipt(rows[0]);
  } finally {
    connection.release();
  }
}

export async function recentCash({
  employeeId,
  scope,
  permissions
}) {
  const [rows] = await pool.execute(
    RECEIPT_QUERY + `
      WHERE (
        ? = 1
        OR (
          r.emp_id = ?
          AND a.branch_ifsc = ?
        )
      )
      AND (
        (? = 1 AND t.trans_type = 'DEPOSIT')
        OR (? = 1 AND t.trans_type = 'WITHDRAWAL')
      )
      ORDER BY t.trans_id DESC
      LIMIT 20
    `,
    [
      scope.allBranches ? 1 : 0,
      employeeId,
      scope.branchIfsc,
      permissions.deposit ? 1 : 0,
      permissions.withdraw ? 1 : 0
    ]
  );

  return rows.map(receipt);
}