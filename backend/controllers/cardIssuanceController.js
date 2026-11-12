
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

export const issueCard = wrap(async (req, res) => {
  const empId = req.user.id;
  const { accountNumber, cardType, dailyLimit } = req.body ?? {};

  // Validate account number
  if (
    typeof accountNumber !== 'string' ||
    !/^[1-9]\d*$/.test(accountNumber) ||
    BigInt(accountNumber) > 18446744073709551615n
  ) {
    return res.status(400).json({
      error: 'Invalid account number'
    });
  }

  // Validate card type
  if (!['DEBIT', 'CREDIT'].includes(cardType)) {
    return res.status(400).json({
      error: 'Card type must be DEBIT or CREDIT'
    });
  }

  // Validate daily limit
  const limit = String(dailyLimit ?? '50000');

  if (!/^[1-9]\d{0,9}(\.\d{1,2})?$/.test(limit)) {
    return res.status(400).json({
      error: 'Invalid daily limit'
    });
  }

  // Fetch the employee issuing the card
  const employee = await prisma.employee.findUnique({
    where: { emp_id: empId },
    select: { branch_ifsc: true }
  });

  if (!employee) {
    return res.status(403).json({
      error: 'Employee not found'
    });
  }

  // Check cross-branch permission
  const permissions = await prisma.$queryRaw`
    SELECT fn_has_permission(
      ${empId}, ${'ACCESS_ALL_BRANCHES'}
    ) AS allowed
  `;

  const canAccessAllBranches =
    Number(permissions[0]?.allowed) === 1;

  // Demo-only identifier, not a payment card PAN
  const demoCardNumber =
    `DEMO-${randomInt(1000000000, 10000000000)}`;

  // Random unrevealed PIN placeholder.
  // Actual PIN setup must use a separate secure flow.
  const randomPin = String(
    randomInt(0, 1000000)
  ).padStart(6, '0');

  const pinHash = await bcrypt.hash(randomPin, 10);

  const issueDate = new Date();
  issueDate.setUTCHours(0, 0, 0, 0);

  const expiryDate = new Date(issueDate);
  expiryDate.setUTCFullYear(
    expiryDate.getUTCFullYear() + 5
  );

  try {
    const card = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { acc_no: BigInt(accountNumber) },
        select: {
          acc_no: true,
          branch_ifsc: true,
          status: true
        }
      });

      if (!account) {
        const error = new Error('Account not found');
        error.statusCode = 404;
        throw error;
      }

      if (account.status !== 'ACTIVE') {
        const error = new Error('Account is not active');
        error.statusCode = 400;
        throw error;
      }

      if (
        !canAccessAllBranches &&
        account.branch_ifsc !== employee.branch_ifsc
      ) {
        const error = new Error(
          'Cannot issue cards for another branch'
        );
        error.statusCode = 403;
        throw error;
      }

      const created = await tx.card.create({
        data: {
          acc_no: account.acc_no,
          approved_by: empId,
          card_no: demoCardNumber,
          card_type: cardType,
          issue_date: issueDate,
          expiry_date: expiryDate,
          pin_hash: pinHash,
          daily_limit: new Prisma.Decimal(limit)
        }
      });

      await tx.audit_log.create({
        data: {
          emp_id: empId,
          action: 'CARD_ISSUE',
          table_name: 'card',
          record_id: String(created.card_id),
          new_value: 'ACTIVE',
          details: `Demo ${cardType} card issued`
        }
      });

      return created;
    });

    res.status(201).json({
      message: 'Demo card issued successfully',
      card: {
        cardId: card.card_id,
        accountNumber: card.acc_no.toString(),
        cardNumber: '**** **** **** ' +
          card.card_no.slice(-4),
        cardType: card.card_type,
        status: card.status,
        issueDate: card.issue_date,
        expiryDate: card.expiry_date,
        dailyLimit: card.daily_limit.toString()
      }
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message
      });
    }

    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Generated card identifier already exists. Retry.'
      });
    }

    throw err;
  }
});


export const updateCardLimit = wrap(async (req, res) => {
  const empId = req.user.id;
  const cardId = Number(req.params.cardId);
  const { dailyLimit } = req.body ?? {};

  if (!Number.isSafeInteger(cardId) || cardId <= 0) {
    return res.status(400).json({
      error: 'Invalid card ID'
    });
  }

  // DECIMAL(12,2): maximum 9999999999.99
  const limit = String(dailyLimit ?? '');

  if (
    !/^[1-9]\d{0,9}(\.\d{1,2})?$/.test(limit) ||
    new Prisma.Decimal(limit).greaterThan('9999999999.99')
  ) {
    return res.status(400).json({
      error: 'Invalid daily limit'
    });
  }

  const employee = await prisma.employee.findUnique({
    where: { emp_id: empId },
    select: { branch_ifsc: true }
  });

  if (!employee) {
    return res.status(403).json({
      error: 'Employee not found'
    });
  }

  const permissions = await prisma.$queryRaw`
    SELECT fn_has_permission(
      ${empId}, ${'ACCESS_ALL_BRANCHES'}
    ) AS allowed
  `;

  const canAccessAllBranches =
    Number(permissions[0]?.allowed) === 1;

  const result = await prisma.$transaction(async (tx) => {
    const card = await tx.card.findUnique({
      where: { card_id: cardId },
      select: {
        card_id: true,
        status: true,
        daily_limit: true,
        account: {
          select: {
            branch_ifsc: true
          }
        }
      }
    });

    if (!card) {
      return {
        status: 404,
        error: 'Card not found'
      };
    }

    if (
      !canAccessAllBranches &&
      card.account.branch_ifsc !== employee.branch_ifsc
    ) {
      return {
        status: 403,
        error: 'Cannot manage cards from another branch'
      };
    }

    if (card.status !== 'ACTIVE') {
      return {
        status: 409,
        error: 'Only active cards can have their limit changed'
      };
    }

    const newLimit = new Prisma.Decimal(limit);

    if (card.daily_limit.equals(newLimit)) {
      return {
        status: 409,
        error: 'Card already has this daily limit'
      };
    }

    const updated = await tx.card.updateMany({
      where: {
        card_id: cardId,
        status: 'ACTIVE',
        daily_limit: card.daily_limit
      },
      data: {
        daily_limit: newLimit
      }
    });

    if (updated.count !== 1) {
      return {
        status: 409,
        error: 'Card was updated by another request. Retry.'
      };
    }

    await tx.audit_log.create({
      data: {
        emp_id: empId,
        action: 'CARD_LIMIT_UPDATE',
        table_name: 'card',
        record_id: String(cardId),
        old_value: card.daily_limit.toString(),
        new_value: newLimit.toString(),
        details: 'Card daily spending limit updated'
      }
    });

    return {
      cardId,
      dailyLimit: newLimit.toString()
    };
  });

  if (result.error) {
    return res.status(result.status).json({
      error: result.error
    });
  }

  return res.json({
    message: 'Card daily limit updated successfully',
    card: result
  });
});
