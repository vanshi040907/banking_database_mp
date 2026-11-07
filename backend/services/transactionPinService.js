import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  supportBigNumbers: true,
  bigNumberStrings: true
});

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export class PinError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}


export async function saveTransactionPin({
  customerId,
  accNo,
  password,
  newPin,
  currentPin,
  operation
}) {
  if (!['setup', 'change'].includes(operation)) {
    throw new PinError('Invalid PIN operation');
  }

  const connection = await pool.getConnection();

  let transactionOpen = false;

  try {
    // Verify the customer's login password.
    const [customers] = await connection.execute(
      `SELECT password_hash
       FROM customer
       WHERE cust_id = ? AND status = 'ACTIVE'`,
      [customerId]
    );

    if (
      !customers.length ||
      !(await bcrypt.compare(
        password,
        customers[0].password_hash
      ))
    ) {
      throw new PinError('Invalid password', 401);
    }

    // Hash before acquiring account locks.
    const newHash = await bcrypt.hash(newPin, 12);

    await connection.beginTransaction();
    transactionOpen = true;

    // Serialize operations on the same account.
    const [accounts] = await connection.execute(
      `SELECT acc_no
       FROM account
       WHERE acc_no = ?
         AND cust_id = ?
         AND status = 'ACTIVE'
       FOR UPDATE`,
      [accNo, customerId]
    );

    if (!accounts.length) {
      throw new PinError('Account not found or inactive', 404);
    }

    const [existing] = await connection.execute(
  `SELECT
     pin_hash,
     failed_attempts,
     (locked_until > NOW()) AS is_locked,
     (locked_until IS NOT NULL AND locked_until <= NOW()) AS expired
   FROM account_transaction_pin
   WHERE acc_no = ?
   FOR UPDATE`,
  [accNo]
);

    if (operation === 'setup') {
      if (existing.length) {
        throw new PinError(
          'PIN already exists. Use the change PIN endpoint.',
          409
        );
      }

      await connection.execute(
        `INSERT INTO account_transaction_pin
         (acc_no, pin_hash)
         VALUES (?, ?)`,
        [accNo, newHash]
      );

      await connection.commit();
      transactionOpen = false;
      return;
    }

    if (!existing.length) {
      throw new PinError('Set up a PIN first', 404);
    }

    const record = existing[0];

    // Enforce existing lockout.
    if (Number(record.is_locked) === 1) {
  throw new PinError(
    'PIN temporarily locked. Try again later.',
    423
  );
}

const previousFailures = Number(record.expired) === 1
  ? 0
  : Number(record.failed_attempts);

    const validCurrentPin = await bcrypt.compare(
      currentPin,
      record.pin_hash
    );

    if (!validCurrentPin) {
  const attempts = previousFailures + 1;

  await connection.execute(
    `UPDATE account_transaction_pin
     SET failed_attempts = ?,
         locked_until = CASE
           WHEN ? >= ?
           THEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
           ELSE NULL
         END
     WHERE acc_no = ?`,
    [
      attempts,
      attempts,
      MAX_ATTEMPTS,
      LOCK_MINUTES,
      accNo
    ]
  );

  // Save the failed attempt before returning an error.
  await connection.commit();
  transactionOpen = false;

  throw new PinError(
    attempts >= MAX_ATTEMPTS
      ? 'PIN temporarily locked'
      : 'Invalid current PIN',
    attempts >= MAX_ATTEMPTS ? 423 : 401
  );
}

    if (await bcrypt.compare(newPin, record.pin_hash)) {
      throw new PinError('New PIN must be different');
    }

    await connection.execute(
      `UPDATE account_transaction_pin
       SET pin_hash = ?,
           failed_attempts = 0,
           locked_until = NULL
       WHERE acc_no = ?`,
      [newHash, accNo]
    );

    await connection.commit();
    transactionOpen = false;

  } catch (err) {
    if (transactionOpen) {
      await connection.rollback();
    }

    throw err;
  } finally {
    connection.release();
  }
}

// bcrypt import, PinError class, MAX_ATTEMPTS and LOCK_MINUTES constants.
export async function verifyTransferPin({ customerId, accNo, transactionPin }) {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const [accounts] = await connection.execute(
      `SELECT acc_no FROM account WHERE acc_no = ? AND cust_id = ?
         AND status = 'ACTIVE' FOR UPDATE`, [accNo, customerId]
    );
    if (!accounts.length) throw new PinError('Account not found or inactive', 404);
    const [pins] = await connection.execute(
      `SELECT pin_hash, failed_attempts,
              (locked_until > NOW()) AS is_locked,
              (locked_until IS NOT NULL AND locked_until <= NOW()) AS expired
         FROM account_transaction_pin WHERE acc_no = ? FOR UPDATE`, [accNo]
    );
    if (!pins.length) throw new PinError('Set up a transaction PIN first', 409);
    const pin = pins[0];
    console.log('PIN DEBUG:', {
  failedAttempts: pin.failed_attempts,
  type: typeof pin.failed_attempts,
  isLocked: pin.is_locked,
  expired: pin.expired
});
    if (Number(pin.is_locked) ===1) throw new PinError('PIN temporarily locked', 423);

    const previousFailures = Number(pin.expired) === 1
  ? 0
  : Number(pin.failed_attempts);


    const valid = await bcrypt.compare(transactionPin, pin.pin_hash);
    if (!valid) {
      const attempts = previousFailures + 1;
      await connection.execute(
        `UPDATE account_transaction_pin
            SET failed_attempts = ?,
                locked_until = CASE WHEN ? >= ?
                  THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE) ELSE NULL END
          WHERE acc_no = ?`, [attempts, attempts, MAX_ATTEMPTS, accNo]
      );
      await connection.commit();
      inTransaction = false;
      console.log('PIN failure committed:', attempts);
      throw new PinError(attempts >= MAX_ATTEMPTS
        ? 'PIN temporarily locked' : 'Invalid transaction PIN',
        attempts >= MAX_ATTEMPTS ? 423 : 401);
    }
    await connection.execute(
      `UPDATE account_transaction_pin SET failed_attempts = 0,
        locked_until = NULL WHERE acc_no = ?`, [accNo]
    );
    await connection.commit();
    inTransaction = false;
  } catch (err) {
    if (inTransaction) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
