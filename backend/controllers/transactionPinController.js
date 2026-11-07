
import { wrap } from '../utils/wrap.js';

import {
  saveTransactionPin,
  PinError
} from '../services/transactionPinService.js';

const validPin = pin =>
  typeof pin === 'string' && /^\d{6}$/.test(pin);

const validAccount = accNo =>
  typeof accNo === 'string' &&
  /^\d{6,20}$/.test(accNo) &&
  BigInt(accNo) <= 18446744073709551615n;

// Shared error handler
const handlePinError = (err, res) => {
  if (err instanceof PinError) {
    res.status(err.status).json({
      error: err.message
    });
    return true;
  }
  return false;
};

// SETUP PIN
export const setupTransactionPin = wrap(async (req, res) => {
  const { accNo } = req.params;
  const { password, newPin } = req.body ?? {};

  if (
    !validAccount(accNo) ||
    !validPin(newPin) ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    return res.status(400).json({
      error: 'Valid account number, password and six-digit PIN required'
    });
  }

  try {
    await saveTransactionPin({
      customerId: req.user.id,
      accNo,
      password,
      newPin,
      operation: 'setup'
    });

    return res.status(201).json({
      message: 'Transaction PIN set up successfully'
    });

  } catch (err) {
    if (handlePinError(err, res)) return;
    throw err;
  }
});

// CHANGE PIN
export const changeTransactionPin = wrap(async (req, res) => {
  const { accNo } = req.params;
  const { password, currentPin, newPin } = req.body ?? {};

  if (
    !validAccount(accNo) ||
    !validPin(currentPin) ||
    !validPin(newPin) ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    return res.status(400).json({
      error: 'Valid account number, password and both six-digit PINs required'
    });
  }

  try {
    await saveTransactionPin({
      customerId: req.user.id,
      accNo,
      password,
      currentPin,
      newPin,
      operation: 'change'
    });

    return res.status(200).json({
      message: 'Transaction PIN changed successfully'
    });

  } catch (err) {
    if (handlePinError(err, res)) return;
    throw err;
  }
});
