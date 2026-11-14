import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
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
        error: 'Employee phone or email is already registered.'
      });
    }

    if (
      error.code === 'P2034' ||
      error.code === 'P2028' ||
      ['1213', '1205'].includes(String(error.meta?.code))
    ) {
      return res.status(409).json({
        error: 'Staff update interrupted. Refresh before retrying.'
      });
    }

    next(error);
  }
};

function id(value) {
  if (
    !/^[1-9]\d{0,9}$/.test(String(value)) ||
    Number(value) > 2147483647
  ) {
    fail(400, 'Invalid employee or role ID');
  }

  return Number(value);
}

function text(value, label, max) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max
  ) {
    fail(400, `Invalid ${label}`);
  }

  return value.trim();
}

function reason(value) {
  const result = text(value, 'reason', 255);

  if (result.length < 5) {
    fail(400, 'Reason must contain at least five characters');
  }

  return result;
}

function date(value, label) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fail(400, `Invalid ${label}`);
  }

  return parsed;
}

const JOINS = Prisma.sql`
  FROM employee e
  JOIN role r ON r.role_id = e.role_id
  JOIN branch b ON b.ifsc_code = e.branch_ifsc
`;

const COLUMNS = Prisma.sql`
  e.emp_id,
  e.emp_name,
  e.designation,
  e.role_id,
  r.role_name,
  e.branch_ifsc,
  b.branch_name,
  e.status,
  DATE_FORMAT(e.join_date, '%Y-%m-%d') AS joined,
  (b.manager_id = e.emp_id) AS is_branch_manager
`;

const scopeWhere = scope => scope.allBranches
  ? Prisma.sql`1 = 1`
  : Prisma.sql`e.branch_ifsc = ${scope.branchIfsc}`;

const employeeView = row => ({
  employeeId: row.emp_id,
  name: row.emp_name,
  designation: row.designation,
  roleId: row.role_id,
  role: row.role_name,
  branchIfsc: row.branch_ifsc,
  branchName: row.branch_name,
  status: row.status,
  joinDate: row.joined,
  isBranchManager: Number(row.is_branch_manager) === 1
});

export async function requireStaffAccess(req, res, next) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        fn_has_permission(
          ${req.user.id}, 'VIEW_EMPLOYEE_ROLES'
        ) AS can_view,
        fn_has_permission(
          ${req.user.id}, 'MANAGE_EMPLOYEES'
        ) AS can_manage
    `;

    req.canManageStaff = Number(rows[0].can_manage) === 1;

    if (
      !req.canManageStaff &&
      Number(rows[0].can_view) !== 1
    ) {
      return res.status(403).json({
        error: 'Staff access denied'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

export const getStaffOptions = endpoint(async (req, res) => {
  const [roles, branches] = await Promise.all([
    prisma.role.findMany({
      select: {
        role_id: true,
        role_name: true
      },
      orderBy: { role_name: 'asc' }
    }),

    prisma.branch.findMany({
      where: req.employeeScope.allBranches
        ? {}
        : { ifsc_code: req.employeeScope.branchIfsc },

      select: {
        ifsc_code: true,
        branch_name: true,
        status: true,
        manager_id: true
      },

      orderBy: { branch_name: 'asc' }
    })
  ]);

  res.json({
    roles: roles.map(row => ({
      roleId: row.role_id,
      name: row.role_name
    })),

    branches: branches.map(row => ({
      ifscCode: row.ifsc_code,
      name: row.branch_name,
      status: row.status,
      managerId: row.manager_id
    }))
  });
});

export const listStaff = endpoint(async (req, res) => {
  const q = req.query.q ?? '';
  const status = req.query.status ?? '';
  const role = req.query.roleId ?? '';
  const branch = req.query.branchIfsc ?? '';
  const page = Number(req.query.page ?? 1);

  if (
    typeof q !== 'string' ||
    q.length > 100 ||
    !['', 'ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000
  ) {
    fail(400, 'Invalid staff filters');
  }

  if (typeof role !== 'string') fail(400, 'Invalid role');
  if (role) id(role);

  if (
    typeof branch !== 'string' ||
    (branch && !/^[A-Z0-9]{11}$/.test(branch))
  ) {
    fail(400, 'Invalid branch');
  }

  if (
    branch &&
    !req.employeeScope.allBranches &&
    branch !== req.employeeScope.branchIfsc
  ) {
    fail(403, 'Cannot access another branch');
  }

  const clauses = [scopeWhere(req.employeeScope)];
  const term = q.trim();

  if (term) {
    const numeric =
      /^[1-9]\d{0,9}$/.test(term) &&
      Number(term) <= 2147483647;

    clauses.push(Prisma.sql`
      (
        LOCATE(${term}, e.emp_name) > 0
        OR e.emp_id = ${numeric ? Number(term) : 0}
      )
    `);
  }

  if (status) clauses.push(Prisma.sql`e.status = ${status}`);
  if (role) clauses.push(Prisma.sql`e.role_id = ${Number(role)}`);
  if (branch) clauses.push(Prisma.sql`e.branch_ifsc = ${branch}`);

  const where = Prisma.join(clauses, ' AND ');

  const [rows, counts] = await Promise.all([
    prisma.$queryRaw`
      SELECT ${COLUMNS}
      ${JOINS}
      WHERE ${where}
      ORDER BY e.emp_id DESC
      LIMIT 20 OFFSET ${(page - 1) * 20}
    `,

    prisma.$queryRaw`
      SELECT COUNT(*) AS total
      ${JOINS}
      WHERE ${where}
    `
  ]);

  const total = Number(counts[0].total);

  res.json({
    employees: rows.map(employeeView),
    page,
    total,
    totalPages: Math.min(1000, Math.ceil(total / 20)),
    refineFilters: total > 20000
  });
});

export const getStaffMember = endpoint(async (req, res) => {
  const employeeId = id(req.params.employeeId);

  const rows = await prisma.$queryRaw`
    SELECT ${COLUMNS}
    ${JOINS}
    WHERE e.emp_id = ${employeeId}
      AND ${scopeWhere(req.employeeScope)}
  `;

  if (!rows[0]) fail(404, 'Employee not found');

  const employee = employeeView(rows[0]);

  if (req.canManageStaff) {
    const details = await prisma.employee.findFirst({
      where: {
        emp_id: employeeId,

        ...(req.employeeScope.allBranches
          ? {}
          : {
              branch_ifsc: req.employeeScope.branchIfsc
            })
      },

      select: {
        dob: true,
        gender: true,
        salary: true,
        must_change_password: true,
        last_login: true,

        employee_phone: {
          select: { phone_no: true }
        },

        employee_email: {
          select: { mail: true }
        }
      }
    });

    if (!details) fail(404, 'Employee not found');

    Object.assign(employee, {
      dob: details.dob.toISOString().slice(0, 10),
      gender: details.gender,
      salary: details.salary.toString(),
      mustChangePassword: details.must_change_password,
      lastLogin: details.last_login,
      phones: details.employee_phone.map(row => row.phone_no),
      emails: details.employee_email.map(row => row.mail)
    });
  }

  res.json({ employee });
});

// Serialize staff writes, then recheck the actor's current access.
// This prevents concurrent admin changes from removing every admin.
async function staffWrite(req, handler) {
  return prisma.$transaction(async tx => {
    const roles = await tx.$queryRaw`
      SELECT role_id
      FROM role
      WHERE role_name = 'ADMIN'
      FOR UPDATE
    `;

    if (!roles[0]) fail(409, 'Admin role is missing');

    const actors = await tx.$queryRaw`
      SELECT emp_id, role_id, branch_ifsc, status
      FROM employee
      WHERE emp_id = ${req.user.id}
      FOR UPDATE
    `;

    const actor = actors[0];

    if (!actor || actor.status !== 'ACTIVE') {
      fail(403, 'Employee is not active');
    }

    const flags = await tx.$queryRaw`
      SELECT
        fn_has_permission(
          ${req.user.id}, 'MANAGE_EMPLOYEES'
        ) AS can_manage,
        fn_has_permission(
          ${req.user.id}, 'ACCESS_ALL_BRANCHES'
        ) AS all_branches
    `;

    if (Number(flags[0].can_manage) !== 1) {
      fail(403, 'Staff management permission denied');
    }

    return handler(tx, {
      id: req.user.id,
      branchIfsc: actor.branch_ifsc,
      allBranches: Number(flags[0].all_branches) === 1,
      adminRoleId: roles[0].role_id,
      isAdmin: actor.role_id === roles[0].role_id
    });
  }, { timeout: 10000 });
}

async function selection(
  tx,
  actor,
  roleId,
  branchIfsc,
  status,
  assign,
  expectedManager
) {
  if (!actor.allBranches && branchIfsc !== actor.branchIfsc) {
    fail(403, 'Cannot manage another branch');
  }

  const role = await tx.role.findUnique({
    where: { role_id: roleId }
  });

  const branches = await tx.$queryRaw`
    SELECT ifsc_code, status, manager_id
    FROM branch
    WHERE ifsc_code = ${branchIfsc}
    FOR UPDATE
  `;

  const branch = branches[0];

  if (!role || !branch) fail(400, 'Invalid role or branch');

  if (status === 'ACTIVE' && branch.status !== 'ACTIVE') {
    fail(400, 'An active employee requires an active branch');
  }

  if (role.role_name === 'ADMIN' && !actor.isAdmin) {
    fail(403, 'Only Admin can assign the Admin role');
  }

  if (
    assign &&
    (role.role_name !== 'MANAGER' || status !== 'ACTIVE')
  ) {
    fail(400, 'A designated branch manager must be an active Manager');
  }

  if (assign && branch.manager_id !== expectedManager) {
    fail(409, 'Branch manager changed. Refresh the staff options.');
  }

  return branch;
}

async function managerLinks(
  tx,
  actor,
  employeeId,
  selectedBranch,
  assign,
  note
) {
  const current = await tx.$queryRaw`
    SELECT ifsc_code
    FROM branch
    WHERE manager_id = ${employeeId}
    FOR UPDATE
  `;

  for (const row of current) {
    if (assign && row.ifsc_code === selectedBranch.ifsc_code) {
      continue;
    }

    await tx.branch.update({
      where: { ifsc_code: row.ifsc_code },
      data: { manager_id: null }
    });

    await tx.audit_log.create({
      data: {
        emp_id: actor.id,
        action: 'BRANCH_MANAGER_CLEAR',
        table_name: 'branch',
        record_id: row.ifsc_code,
        old_value: String(employeeId),
        new_value: null,
        details: note
      }
    });
  }

  if (assign && selectedBranch.manager_id !== employeeId) {
    await tx.branch.update({
      where: { ifsc_code: selectedBranch.ifsc_code },
      data: { manager_id: employeeId }
    });

    await tx.audit_log.create({
      data: {
        emp_id: actor.id,
        action: 'BRANCH_MANAGER_SET',
        table_name: 'branch',
        record_id: selectedBranch.ifsc_code,

        old_value: selectedBranch.manager_id == null
          ? null
          : String(selectedBranch.manager_id),

        new_value: String(employeeId),
        details: note
      }
    });
  }
}

export const createStaffMember = endpoint(async (req, res) => {
  const body = req.body ?? {};

  const name = text(body.name, 'name', 100);
  const designation = text(body.designation, 'designation', 50);
  const dob = date(body.dob, 'date of birth');
  const joined = date(body.joinDate, 'joining date');

  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata'
  });

  if (body.dob >= body.joinDate || body.joinDate > today) {
    fail(400, 'Check birth and joining dates');
  }

  if (!['M', 'F', 'O'].includes(body.gender)) {
    fail(400, 'Invalid gender');
  }

  if (
    typeof body.salary !== 'string' ||
    !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(body.salary)
  ) {
    fail(400, 'Invalid salary');
  }

  const phone = text(body.phone, 'phone', 15);

  if (!/^\+[1-9]\d{7,13}$/.test(phone)) {
    fail(400, 'Use a phone number such as +919876543210');
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

  const roleId = id(body.roleId);
  const branchIfsc = text(body.branchIfsc, 'branch', 11);

  if (!/^[A-Z0-9]{11}$/.test(branchIfsc)) {
    fail(400, 'Invalid branch');
  }

  const assign = body.assignBranchManager ?? false;

  if (typeof assign !== 'boolean') {
    fail(400, 'Invalid manager selection');
  }

  const expectedManager = assign
    ? (
        body.expectedBranchManagerId === null
          ? null
          : id(body.expectedBranchManagerId)
      )
    : null;

  const note = reason(body.reason);

  const temporaryPassword = crypto.randomBytes(18)
    .toString('base64url');

  const hash = await bcrypt.hash(temporaryPassword, 12);

  const employeeId = await staffWrite(req, async (tx, actor) => {
    const branch = await selection(
      tx, actor, roleId, branchIfsc,
      'ACTIVE', assign, expectedManager
    );

    const employee = await tx.employee.create({
      data: {
        emp_name: name,
        designation,
        dob,
        gender: body.gender,
        salary: new Prisma.Decimal(body.salary),
        join_date: joined,
        branch_ifsc: branchIfsc,
        role_id: roleId,
        status: 'ACTIVE',
        password_hash: hash,
        must_change_password: true
      }
    });

    await tx.employee_phone.create({
      data: {
        emp_id: employee.emp_id,
        phone_no: phone
      }
    });

    if (email) {
      await tx.employee_email.create({
        data: {
          emp_id: employee.emp_id,
          mail: email
        }
      });
    }

    await managerLinks(
      tx, actor, employee.emp_id, branch, assign, note
    );

    await tx.audit_log.create({
      data: {
        emp_id: actor.id,
        action: 'EMPLOYEE_CREATE',
        table_name: 'employee',
        record_id: String(employee.emp_id),

        new_value: JSON.stringify({
          roleId,
          branchIfsc,
          status: 'ACTIVE',
          isBranchManager: assign
        }),

        details: note
      }
    });

    return employee.emp_id;
  });

  res.status(201).json({
    employeeId,
    temporaryPassword
  });
});

export const updateStaffAccess = endpoint(async (req, res) => {
  const employeeId = id(req.params.employeeId);

  if (employeeId === req.user.id) {
    fail(403, 'You cannot change your own access');
  }

  const body = req.body ?? {};
  const roleId = id(body.roleId);
  const branchIfsc = text(body.branchIfsc, 'branch', 11);
  const status = body.status;
  const assign = body.assignBranchManager;
  const note = reason(body.reason);
  const expected = body.expected;

  if (
    !/^[A-Z0-9]{11}$/.test(branchIfsc) ||
    !['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status) ||
    typeof assign !== 'boolean'
  ) {
    fail(400, 'Invalid access selection');
  }

  if (
    !expected ||
    typeof expected.isBranchManager !== 'boolean'
  ) {
    fail(400, 'Refresh employee details before editing');
  }

  const expectedRole = id(expected.roleId);

  const expectedManager = assign
    ? (
        body.expectedBranchManagerId === null
          ? null
          : id(body.expectedBranchManagerId)
      )
    : null;

  await staffWrite(req, async (tx, actor) => {
    const rows = await tx.$queryRaw`
      SELECT emp_id, branch_ifsc, role_id, status
      FROM employee
      WHERE emp_id = ${employeeId}
      FOR UPDATE
    `;

    const target = rows[0];

    if (
      !target ||
      (
        !actor.allBranches &&
        target.branch_ifsc !== actor.branchIfsc
      )
    ) {
      fail(404, 'Employee not found');
    }

    if (
      target.role_id === actor.adminRoleId &&
      !actor.isAdmin
    ) {
      fail(403, 'Only Admin can manage Admin accounts');
    }

    const currentBranches = await tx.$queryRaw`
      SELECT manager_id
      FROM branch
      WHERE ifsc_code = ${target.branch_ifsc}
      FOR UPDATE
    `;

    const wasManager =
      currentBranches[0]?.manager_id === employeeId;

    if (
      target.role_id !== expectedRole ||
      target.branch_ifsc !== expected.branchIfsc ||
      target.status !== expected.status ||
      wasManager !== expected.isBranchManager
    ) {
      fail(409, 'Employee access changed. Refresh before editing.');
    }

    if (
      target.role_id === roleId &&
      target.branch_ifsc === branchIfsc &&
      target.status === status &&
      wasManager === assign
    ) {
      fail(409, 'No access changes selected');
    }

    const branch = await selection(
      tx, actor, roleId, branchIfsc,
      status, assign, expectedManager
    );

    if (
      target.role_id === actor.adminRoleId &&
      target.status === 'ACTIVE' &&
      (
        roleId !== actor.adminRoleId ||
        status !== 'ACTIVE'
      )
    ) {
      const count = await tx.employee.count({
        where: {
          role_id: actor.adminRoleId,
          status: 'ACTIVE'
        }
      });

      if (count <= 1) {
        fail(409, 'The last active Admin cannot be removed');
      }
    }

    await tx.employee.update({
      where: { emp_id: employeeId },

      data: {
        role_id: roleId,
        branch_ifsc: branchIfsc,
        status
      }
    });

    await managerLinks(
      tx, actor, employeeId, branch, assign, note
    );

    await tx.audit_log.create({
      data: {
        emp_id: actor.id,
        action: 'EMPLOYEE_ACCESS_UPDATE',
        table_name: 'employee',
        record_id: String(employeeId),

        old_value: JSON.stringify({
          roleId: target.role_id,
          branchIfsc: target.branch_ifsc,
          status: target.status,
          isBranchManager: wasManager
        }),

        new_value: JSON.stringify({
          roleId,
          branchIfsc,
          status,
          isBranchManager: assign
        }),

        details: note
      }
    });
  });

  res.json({ message: 'Employee access updated' });
});