import { prisma } from '../db.js';

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

const endpoint = handler => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message
      });
    }

    next(error);
  }
};

function cardId(value) {
  if (!/^[1-9]\d{0,9}$/.test(String(value))) {
    fail(400, 'Invalid card ID');
  }

  const id = Number(value);

  if (id > 2147483647) fail(400, 'Invalid card ID');

  return id;
}

function requestId(value) {
  if (!/^[1-9]\d{0,18}$/.test(String(value))) {
    fail(400, 'Invalid request ID');
  }

  const id = BigInt(value);

  if (id > 9223372036854775807n) {
    fail(400, 'Invalid request ID');
  }

  return id;
}

function text(value, label) {
  if (
    typeof value !== 'string' ||
    value.trim().length < 5 ||
    value.trim().length > 255
  ) {
    fail(400, `${label} must contain 5 to 255 characters`);
  }

  return value.trim();
}

const formatRequest = row => ({
  requestId: String(row.request_id),
  cardId: row.card_id,
  reason: row.reason,
  status: row.status,
  reviewNote: row.review_note,
  createdAt: row.created_at,
  reviewedAt: row.reviewed_at
});

// Create and review use the same lock order:
// account -> card -> request.
async function lockCard(tx, id) {
  const link = await tx.card.findUnique({
    where: { card_id: id },
    select: { acc_no: true }
  });

  if (!link) fail(404, 'Card not found');

  const accounts = await tx.$queryRaw`
    SELECT
      acc_no,
      cust_id,
      branch_ifsc,
      status AS account_status
    FROM account
    WHERE acc_no = ${link.acc_no}
    FOR UPDATE
  `;

  const cards = await tx.$queryRaw`
    SELECT
      card_id,
      acc_no,
      status AS card_status,
      (expiry_date > CURRENT_DATE) AS unexpired
    FROM card
    WHERE card_id = ${id}
    FOR UPDATE
  `;

  if (!accounts[0] || !cards[0]) {
    fail(404, 'Card not found');
  }

  if (String(cards[0].acc_no) !== String(link.acc_no)) {
    fail(409, 'Card account changed. Refresh and retry.');
  }

  return { ...accounts[0], ...cards[0] };
}

function canReactivate(card) {
  if (card.card_status !== 'BLOCKED') {
    fail(409, 'Card is no longer blocked');
  }

  if (Number(card.unexpired) !== 1) {
    fail(409, 'Expired cards cannot be unblocked');
  }

  if (card.account_status !== 'ACTIVE') {
    fail(409, 'Linked account must be active');
  }
}

export const createUnblockRequest = endpoint(async (req, res) => {
  const id = cardId(req.params.cardId);
  const reason = text(req.body?.reason, 'Reason');

  const result = await prisma.$transaction(async tx => {
    const card = await lockCard(tx, id);

    if (card.cust_id !== req.user.id) {
      fail(404, 'Card not found');
    }

    canReactivate(card);

    const pending = await tx.$queryRaw`
      SELECT request_id
      FROM card_unblock_request
      WHERE pending_card_id = ${id}
      FOR UPDATE
    `;

    if (pending.length) {
      fail(409, 'An unblock request is already pending');
    }

    await tx.$executeRaw`
      INSERT INTO card_unblock_request (
        card_id, cust_id, reason
      )
      VALUES (${id}, ${req.user.id}, ${reason})
    `;

    const rows = await tx.$queryRaw`
      SELECT request_id
      FROM card_unblock_request
      WHERE pending_card_id = ${id}
    `;

    await tx.audit_log.create({
      data: {
        action: 'CARD_UNBLOCK_REQUEST',
        table_name: 'card_unblock_request',
        record_id: String(rows[0].request_id),
        new_value: 'PENDING',
        details: `Customer ${req.user.id}; card ${id}; ${reason}`
      }
    });

    return String(rows[0].request_id);
  });

  res.status(201).json({
    requestId: result,
    message: 'Unblock request submitted'
  });
});

export const getMyUnblockRequests = endpoint(async (req, res) => {
  // Return the latest request for each card owned by this customer.
  const rows = await prisma.$queryRaw`
    SELECT
      r.request_id,
      r.card_id,
      r.reason,
      r.status,
      r.review_note,
      r.created_at,
      r.reviewed_at
    FROM card_unblock_request r
    JOIN card c ON c.card_id = r.card_id
    JOIN account a ON a.acc_no = c.acc_no
    WHERE r.cust_id = ${req.user.id}
      AND a.cust_id = ${req.user.id}
      AND r.request_id = (
        SELECT MAX(r2.request_id)
        FROM card_unblock_request r2
        WHERE r2.card_id = r.card_id
          AND r2.cust_id = r.cust_id
      )
    ORDER BY r.request_id DESC
  `;

  res.json({ requests: rows.map(formatRequest) });
});

export const listUnblockRequests = endpoint(async (req, res) => {
  const status = req.query.status ?? 'PENDING';

  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
    fail(400, 'Invalid status');
  }

  const rows = await prisma.$queryRaw`
    SELECT
      r.request_id,
      r.card_id,
      r.reason,
      r.status,
      r.review_note,
      r.created_at,
      r.reviewed_at,
      c.card_no,
      a.acc_no,
      a.branch_ifsc,
      b.branch_name
    FROM card_unblock_request r
    JOIN card c ON c.card_id = r.card_id
    JOIN account a ON a.acc_no = c.acc_no
    JOIN branch b ON b.ifsc_code = a.branch_ifsc
    WHERE r.status = ${status}
      AND (
        fn_has_permission(
          ${req.user.id}, 'ACCESS_ALL_BRANCHES'
        ) = 1
        OR a.branch_ifsc = (
          SELECT branch_ifsc
          FROM employee
          WHERE emp_id = ${req.user.id}
            AND status = 'ACTIVE'
        )
      )
    ORDER BY r.request_id DESC
    LIMIT 100
  `;

  res.json({
    requests: rows.map(row => ({
      ...formatRequest(row),
      accountNumber: String(row.acc_no),
      cardNumber:
        `**** **** **** ${row.card_no.replace(/\D/g, '').slice(-4)}`,
      branchName: row.branch_name
    }))
  });
});

export const reviewUnblockRequest = endpoint(async (req, res) => {
  const id = requestId(req.params.requestId);
  const decision = req.body?.decision;

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    fail(400, 'Invalid decision');
  }

  const note = text(req.body?.note, 'Review note');

  const links = await prisma.$queryRaw`
    SELECT card_id
    FROM card_unblock_request
    WHERE request_id = ${id}
  `;

  if (!links.length) fail(404, 'Request not found');

  await prisma.$transaction(async tx => {
    const card = await lockCard(tx, links[0].card_id);

    const employees = await tx.$queryRaw`
      SELECT
        branch_ifsc,
        fn_has_permission(
          emp_id, 'ACCESS_ALL_BRANCHES'
        ) AS all_branches,
        fn_has_permission(
          emp_id, 'UNBLOCK_CARD'
        ) AS can_review
      FROM employee
      WHERE emp_id = ${req.user.id}
        AND status = 'ACTIVE'
    `;

    const employee = employees[0];

    if (!employee || Number(employee.can_review) !== 1) {
      fail(403, 'Permission denied');
    }

    if (
      Number(employee.all_branches) !== 1 &&
      employee.branch_ifsc !== card.branch_ifsc
    ) {
      fail(404, 'Request not found');
    }

    const rows = await tx.$queryRaw`
      SELECT status, cust_id
      FROM card_unblock_request
      WHERE request_id = ${id}
      FOR UPDATE
    `;

    if (!rows.length) fail(404, 'Request not found');

    if (rows[0].status !== 'PENDING') {
      fail(409, 'Request has already been reviewed');
    }

    if (decision === 'APPROVED') {
      if (rows[0].cust_id !== card.cust_id) {
        fail(409, 'Card ownership changed');
      }

      canReactivate(card);

      await tx.card.update({
        where: { card_id: links[0].card_id },
        data: { status: 'ACTIVE' }
      });
    }

    await tx.$executeRaw`
      UPDATE card_unblock_request
      SET
        status = ${decision},
        reviewed_by = ${req.user.id},
        review_note = ${note},
        reviewed_at = NOW()
      WHERE request_id = ${id}
    `;

    await tx.audit_log.create({
      data: {
        emp_id: req.user.id,
        action: decision === 'APPROVED'
          ? 'CARD_UNBLOCK_APPROVE'
          : 'CARD_UNBLOCK_REJECT',
        table_name: 'card_unblock_request',
        record_id: String(id),
        old_value: 'PENDING',
        new_value: decision,
        details: `Card ${links[0].card_id}; ${note}`
      }
    });
  });

  res.json({
    message: decision === 'APPROVED'
      ? 'Card unblocked'
      : 'Request rejected'
  });
});