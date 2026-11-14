import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

const endpoint = handler => async (req, res, next) => {
  res.set('Cache-Control', 'no-store');

  try {
    await handler(req, res);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message
      });
    }

    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Identity document, PAN, phone or email is already registered.'
      });
    }

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'A related branch or location is invalid.'
      });
    }

    next(error);
  }
};

function value(input, label, max) {
  if (
    typeof input !== 'string' ||
    !input.trim() ||
    input.trim().length > max
  ) {
    fail(400, `${label} is required (maximum ${max} characters)`);
  }

  return input.trim();
}

function id(input) {
  if (
    !/^[1-9]\d{0,9}$/.test(String(input)) ||
    Number(input) > 2147483647
  ) {
    fail(400, 'Invalid customer ID');
  }

  return Number(input);
}

function contacts(body) {
  const phone = value(
    body.phone, 'Primary phone', 15
  ).replace(/\s/g, '');

  if (!/^\+[1-9]\d{7,13}$/.test(phone)) {
    fail(400, 'Use a phone number such as +919876543210');
  }

  const pincode = value(body.pincode, 'Pincode', 6);

  if (!/^\d{6}$/.test(pincode)) {
    fail(400, 'Pincode must contain six digits');
  }

  if (body.email != null && typeof body.email !== 'string') {
    fail(400, 'Invalid email');
  }

  const email = body.email?.trim().toLowerCase() || null;

  if (
    email &&
    (
      email.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
  ) {
    fail(400, 'Invalid email');
  }

  return {
    addressLine: value(body.addressLine, 'Address', 255),
    pincode,
    city: value(body.city, 'City', 60),
    state: value(body.state, 'State', 60),
    phone,
    email
  };
}

function scopeWhere(scope) {
  return scope.allBranches ? {} : {
    OR: [
      { registered_branch_ifsc: scope.branchIfsc },
      {
        account: {
          some: { branch_ifsc: scope.branchIfsc }
        }
      }
    ]
  };
}

const profileSelect = {
  cust_id: true,
  name: true,
  dob: true,
  gender: true,
  address_line: true,
  pincode: true,
  id_proof_type: true,
  id_proof_no: true,
  pan_no: true,
  kyc_status: true,
  status: true,
  registered_branch_ifsc: true,

  location: {
    select: { city: true, state: true }
  },

  customer_phone: {
    where: { is_primary: true },
    select: { ph_no: true }
  },

  customer_email: {
    where: { is_primary: true },
    select: { mail: true }
  }
};

const profile = row => ({
  customerId: row.cust_id,
  name: row.name,
  dob: row.dob.toISOString().slice(0, 10),
  gender: row.gender,
  addressLine: row.address_line,
  pincode: row.pincode,
  city: row.location.city,
  state: row.location.state,
  proofType: row.id_proof_type,
  proofNo: row.id_proof_no,
  panNo: row.pan_no ?? '',
  kycStatus: row.kyc_status,
  status: row.status,
  registrationBranchIfsc: row.registered_branch_ifsc,
  phone: row.customer_phone[0]?.ph_no ?? '',
  email: row.customer_email[0]?.mail ?? ''
});

async function findCustomer(db, customerId, scope) {
  const row = await db.customer.findFirst({
    where: {
      AND: [
        { cust_id: customerId },
        scopeWhere(scope)
      ]
    },
    select: profileSelect
  });

  if (!row) fail(404, 'Customer not found');

  return row;
}

async function ensureLocation(tx, data) {
  const row = await tx.location.upsert({
    where: { pincode: data.pincode },

    create: {
      pincode: data.pincode,
      city: data.city,
      state: data.state
    },

    update: {}
  });

  if (
    row.city.toLowerCase() !== data.city.toLowerCase() ||
    row.state.toLowerCase() !== data.state.toLowerCase()
  ) {
    fail(
      409,
      `This pincode is already mapped to ${row.city}, ${row.state}`
    );
  }
}

async function savePrimaryContacts(tx, customerId, data) {
  await tx.customer_phone.updateMany({
    where: { cust_id: customerId },
    data: { is_primary: false }
  });

  await tx.customer_phone.upsert({
    where: {
      cust_id_ph_no: {
        cust_id: customerId,
        ph_no: data.phone
      }
    },

    create: {
      cust_id: customerId,
      ph_no: data.phone,
      is_primary: true
    },

    update: { is_primary: true }
  });

  await tx.customer_email.updateMany({
    where: { cust_id: customerId },
    data: { is_primary: false }
  });

  if (data.email) {
    await tx.customer_email.upsert({
      where: {
        cust_id_mail: {
          cust_id: customerId,
          mail: data.email
        }
      },

      create: {
        cust_id: customerId,
        mail: data.email,
        is_primary: true
      },

      update: { is_primary: true }
    });
  }
}

export const getCustomerOptions = endpoint(async (req, res) => {
  const branches = await prisma.branch.findMany({
    where: {
      status: 'ACTIVE',
      ...(
        req.employeeScope.allBranches
          ? {}
          : { ifsc_code: req.employeeScope.branchIfsc }
      )
    },

    select: {
      ifsc_code: true,
      branch_name: true
    },

    orderBy: { branch_name: 'asc' }
  });

  res.json({
    branches: branches.map(branch => ({
      ifscCode: branch.ifsc_code,
      name: branch.branch_name
    }))
  });
});

export const listCustomers = endpoint(async (req, res) => {
  const q = req.query.q ?? '';
  const page = Number(req.query.page ?? 1);

  if (
    typeof q !== 'string' ||
    q.length > 80 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000
  ) {
    fail(400, 'Invalid search or page');
  }

  const term = q.trim();

  const search = term ? {
    OR: [
      { name: { contains: term } },

      {
        customer_phone: {
          some: { ph_no: { contains: term } }
        }
      },

      ...(
        /^[1-9]\d{0,9}$/.test(term) &&
        Number(term) <= 2147483647
          ? [{ cust_id: Number(term) }]
          : []
      )
    ]
  } : {};

  const where = {
    AND: [
      scopeWhere(req.employeeScope),
      search
    ]
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: (page - 1) * 20,
      take: 20,
      orderBy: { cust_id: 'desc' },

      select: {
        cust_id: true,
        name: true,
        kyc_status: true,
        status: true,

        customer_phone: {
          where: { is_primary: true },
          select: { ph_no: true }
        }
      }
    }),

    prisma.customer.count({ where })
  ]);

  res.json({
    customers: rows.map(row => ({
      customerId: row.cust_id,
      name: row.name,
      kycStatus: row.kyc_status,
      status: row.status,
      phone: row.customer_phone[0]?.ph_no ?? ''
    })),

    page,
    total,
    totalPages: Math.ceil(total / 20)
  });
});

export const getCustomer = endpoint(async (req, res) => {
  const customer = await findCustomer(
    prisma,
    id(req.params.customerId),
    req.employeeScope
  );

  res.json({ customer: profile(customer) });
});

export const registerCustomer = endpoint(async (req, res) => {
  const body = req.body ?? {};
  const data = contacts(body);

  const name = value(body.name, 'Name', 100);
  const dobString = value(body.dob, 'Date of birth', 10);
  const dob = new Date(`${dobString}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dobString) ||
    Number.isNaN(dob.getTime()) ||
    dob.toISOString().slice(0, 10) !== dobString ||
    dob > new Date()
  ) {
    fail(400, 'Invalid date of birth');
  }

  if (!['M', 'F', 'O'].includes(body.gender)) {
    fail(400, 'Invalid gender');
  }

  if (
    ![
      'AADHAAR',
      'PASSPORT',
      'VOTER_ID',
      'DRIVING_LICENSE'
    ].includes(body.proofType)
  ) {
    fail(400, 'Invalid identity document type');
  }

  const proofNo = value(
    body.proofNo, 'Identity document number', 30
  ).toUpperCase().replace(/[\s-]/g, '');

  if (
    !/^[A-Z0-9]+$/.test(proofNo) ||
    (
      body.proofType === 'AADHAAR' &&
      !/^\d{12}$/.test(proofNo)
    )
  ) {
    fail(400, 'Invalid identity document number');
  }

  if (body.panNo != null && typeof body.panNo !== 'string') {
    fail(400, 'Invalid PAN');
  }

  const panNo = body.panNo?.trim().toUpperCase() || null;

  if (panNo && !/^[A-Z]{5}\d{4}[A-Z]$/.test(panNo)) {
    fail(400, 'Invalid PAN');
  }

  const kycStatus = body.kycStatus ?? 'PENDING';

  if (!['PENDING', 'VERIFIED'].includes(kycStatus)) {
    fail(400, 'Choose pending or verified KYC');
  }

  const scope = req.employeeScope;

  const branchIfsc = scope.allBranches
    ? body.registrationBranchIfsc
    : scope.branchIfsc;

  if (
    !scope.allBranches &&
    body.registrationBranchIfsc &&
    body.registrationBranchIfsc !== scope.branchIfsc
  ) {
    fail(403, 'Cannot register in another branch');
  }

  if (typeof branchIfsc !== 'string') {
    fail(400, 'Select a registration branch');
  }

  const temporaryPassword = crypto.randomBytes(18)
    .toString('base64url');

  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const customerId = await prisma.$transaction(async tx => {
    const branch = await tx.branch.findFirst({
      where: {
        ifsc_code: branchIfsc,
        status: 'ACTIVE'
      }
    });

    if (!branch) {
      fail(400, 'Registration branch is not active');
    }

    // Match existing formatted identity numbers too.
    const duplicate = await tx.$queryRaw`
      SELECT cust_id
      FROM customer
      WHERE id_proof_type = ${body.proofType}
        AND UPPER(
          REPLACE(REPLACE(id_proof_no, ' ', ''), '-', '')
        ) = ${proofNo}
      LIMIT 1
    `;

    if (duplicate.length) {
      fail(409, 'Identity document is already registered');
    }

    await ensureLocation(tx, data);

    const customer = await tx.customer.create({
      data: {
        name,
        dob,
        gender: body.gender,
        address_line: data.addressLine,
        pincode: data.pincode,
        id_proof_type: body.proofType,
        id_proof_no: proofNo,
        pan_no: panNo,
        kyc_status: kycStatus,
        registered_branch_ifsc: branchIfsc,
        password_hash: passwordHash,
        must_change_password: true
      }
    });

    await savePrimaryContacts(tx, customer.cust_id, data);

    await tx.audit_log.create({
      data: {
        emp_id: req.user.id,
        action: 'CUSTOMER_REGISTER',
        table_name: 'customer',
        record_id: String(customer.cust_id),
        new_value: 'ACTIVE',
        details: `Registration branch ${branchIfsc}; KYC ${kycStatus}`
      }
    });

    return customer.cust_id;
  });

  res.status(201).json({
    customerId,
    temporaryPassword,
    message: 'Customer registered. Open an account separately.'
  });
});

export const updateCustomerContacts = endpoint(async (req, res) => {
  const customerId = id(req.params.customerId);
  const data = contacts(req.body ?? {});

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`
      SELECT cust_id
      FROM customer
      WHERE cust_id = ${customerId}
      FOR UPDATE
    `;

    const old = profile(await findCustomer(
      tx, customerId, req.employeeScope
    ));

    await ensureLocation(tx, data);

    await tx.customer.update({
      where: { cust_id: customerId },

      data: {
        address_line: data.addressLine,
        pincode: data.pincode
      }
    });

    await savePrimaryContacts(tx, customerId, data);

    for (const field of [
      'addressLine', 'pincode', 'phone', 'email'
    ]) {
      const previous = old[field] || null;
      const next = data[field] || null;

      if (previous !== next) {
        await tx.audit_log.create({
          data: {
            emp_id: req.user.id,
            action: 'CUSTOMER_CONTACT_UPDATE',
            table_name: 'customer',
            record_id: String(customerId),
            old_value: previous,
            new_value: next,
            details: `Field: ${field}`
          }
        });
      }
    }
  });

  res.json({ message: 'Customer contacts updated' });
});

export const reviewCustomerKyc = endpoint(async (req, res) => {
  const customerId = id(req.params.customerId);
  const status = req.body?.status;
  const note = value(req.body?.note, 'KYC review note', 255);

  if (
    note.length < 5 ||
    !['PENDING', 'VERIFIED', 'REJECTED'].includes(status)
  ) {
    fail(
      400,
      'Select a KYC status and enter a review note of at least five characters'
    );
  }

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`
      SELECT cust_id
      FROM customer
      WHERE cust_id = ${customerId}
      FOR UPDATE
    `;

    const old = await findCustomer(
      tx, customerId, req.employeeScope
    );

    if (old.kyc_status === status) {
      fail(409, 'Customer already has this KYC status');
    }

    await tx.customer.update({
      where: { cust_id: customerId },
      data: { kyc_status: status }
    });

    await tx.audit_log.create({
      data: {
        emp_id: req.user.id,
        action: 'KYC_REVIEW',
        table_name: 'customer',
        record_id: String(customerId),
        old_value: old.kyc_status,
        new_value: status,
        details: note
      }
    });
  });

  res.json({ message: 'KYC status updated' });
});