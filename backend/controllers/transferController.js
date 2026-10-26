import { transferMoney } from '../services/transferService.js';
import { wrap } from '../utils/wrap.js';

export const createTransfer = wrap(async (req, res) => {
  const {
    fromAccNo,
    toAccNo,
    amount,
    remarks = ''
  } = req.body ?? {};

  // Account numbers must be strings to avoid JavaScript
  // precision loss with large BIGINT values.
  if (
    typeof fromAccNo !== 'string' ||
    typeof toAccNo !== 'string' ||
    !/^\d{6,20}$/.test(fromAccNo) ||
    !/^\d{6,20}$/.test(toAccNo)
  ) {
    return res.status(400).json({
      error: 'Valid account numbers are required as strings'
    });
  }

  if (fromAccNo === toAccNo) {
    return res.status(400).json({
      error: 'Cannot transfer to the same account'
    });
  }

  // Accept decimal strings only, with at most two decimal places.
  if (
    typeof amount !== 'string' ||
    !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(amount) ||
    Number(amount) <= 0
  ) {
    return res.status(400).json({
      error: 'Enter a valid positive amount with up to two decimal places'
    });
  }

  if (
    typeof remarks !== 'string' ||
    remarks.length > 255
  ) {
    return res.status(400).json({
      error: 'Remarks must not exceed 255 characters'
    });
  }

  try {
    const result = await transferMoney({
      customerId: req.user.id,
      fromAccNo,
      toAccNo,
      amount,
      remarks
    });

    res.status(201).json({
      message: 'Transfer completed successfully',
      transactionId: result.transactionId,
      fromAccount: fromAccNo,
      toAccount: toAccNo,
      amount
    });
  } catch (err) {
    const knownErrors = [
      'Insufficient balance',
      'Sender account not found',
      'Receiver account not found',
      'You can only send money from your own account',
      'Your account is not active',
      'Receiver account cannot accept money right now',
      'Cannot transfer to the same account'
    ];

    const message = String(err.sqlMessage ?? err.message ?? '');

    if (err.sqlState === '45000' && knownErrors.includes(message)) {
      return res.status(400).json({ error: message });
    }

    throw err;
  }
});