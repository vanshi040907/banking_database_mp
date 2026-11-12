
import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

// GET /api/customer/cards
export const getMyCards = wrap(async (req, res) => {
  const custId = req.user.id;

  const cards = await prisma.card.findMany({
    where: {
      account: {
        is: {
          cust_id: custId
        }
      }
    },
    select: {
      card_id: true,
      card_no: true,
      card_type: true,
      issue_date: true,
      expiry_date: true,
      status: true,
      daily_limit: true,
      account: {
        select: {
          acc_no: true
        }
      }
    },
    orderBy: {
      card_id: 'asc'
    }
  });

  // Never send complete card numbers to the frontend.
  const maskCardNumber = (number) => {
    const digits = number.replace(/\D/g, '');
    return `**** **** **** ${digits.slice(-4)}`;
  };

  res.json({
    totalCards: cards.length,
    cards: cards.map((card) => ({
      cardId: card.card_id,
      accountNumber: card.account.acc_no.toString(),
      cardNumber: maskCardNumber(card.card_no),
      cardType: card.card_type,
      issueDate: card.issue_date,
      expiryDate: card.expiry_date,
      status: card.status,
      dailyLimit: card.daily_limit.toString()
    }))
  });
});


export const getCardDetails = wrap(async (req, res) => {
  const custId = req.user.id;
  const cardId = Number(req.params.cardId);

  if (!Number.isSafeInteger(cardId) || cardId <= 0) {
    return res.status(400).json({
      error: 'Invalid card ID'
    });
  }

  const card = await prisma.card.findFirst({
    where: {
      card_id: cardId,
      account: {
        is: {
          cust_id: custId
        }
      }
    },
    select: {
      card_id: true,
      card_no: true,
      card_type: true,
      issue_date: true,
      expiry_date: true,
      status: true,
      daily_limit: true,
      account: {
        select: {
          acc_no: true
        }
      }
    }
  });

  if (!card) {
    return res.status(404).json({
      error: 'Card not found'
    });
  }

  const digits = card.card_no.replace(/\D/g, '');

  res.json({
    card: {
      cardId: card.card_id,
      accountNumber: card.account.acc_no.toString(),
      cardNumber: `**** **** **** ${digits.slice(-4)}`,
      cardType: card.card_type,
      issueDate: card.issue_date,
      expiryDate: card.expiry_date,
      status: card.status,
      dailyLimit: card.daily_limit.toString()
    }
  });
});


export const blockMyCard = wrap(async (req, res) => {
  const custId = req.user.id;
  const cardId = Number(req.params.cardId);

  if (!Number.isSafeInteger(cardId) || cardId <= 0) {
    return res.status(400).json({
      error: 'Invalid card ID'
    });
  }

  // Ensure this card belongs to the logged-in customer
  const card = await prisma.card.findFirst({
    where: {
      card_id: cardId,
      account: {
        is: { cust_id: custId }
      }
    },
    select: {
      card_id: true,
      status: true
    }
  });

  if (!card) {
    return res.status(404).json({
      error: 'Card not found'
    });
  }

  if (card.status === 'BLOCKED') {
    return res.status(409).json({
      error: 'Card is already blocked'
    });
  }

  if (card.status !== 'ACTIVE') {
    return res.status(409).json({
      error: 'Only active cards can be blocked'
    });
  }

  // Update status and audit entry in one DB transaction
  const blocked = await prisma.$transaction(async (tx) => {
    const result = await tx.card.updateMany({
      where: {
        card_id: cardId,
        status: 'ACTIVE'
      },
      data: {
        status: 'BLOCKED'
      }
    });

    if (result.count !== 1) {
      return false;
    }

    await tx.audit_log.create({
      data: {
        action: 'CARD_BLOCK',
        table_name: 'card',
        record_id: String(cardId),
        old_value: 'ACTIVE',
        new_value: 'BLOCKED',
        details: `Card blocked by customer ${custId}`
      }
    });

    return true;
  });

  if (!blocked) {
    return res.status(409).json({
      error: 'Card status changed. Please refresh and retry.'
    });
  }

  return res.json({
    message: 'Card blocked successfully',
    cardId,
    status: 'BLOCKED'
  });
});
