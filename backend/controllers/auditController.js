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

    next(error);
  }
};

const JOINS = Prisma.sql`
  FROM audit_log l
  LEFT JOIN employee e ON e.emp_id = l.emp_id
`;

const OWN_SCOPE = scope => scope.allBranches
  ? Prisma.sql`1 = 1`
  : Prisma.sql`
      EXISTS (
        SELECT 1
        FROM audit_log_branch s
        WHERE s.log_id = l.log_id
          AND s.branch_ifsc = ${scope.branchIfsc}
      )
    `;

const STAFF_SENSITIVE = Prisma.sql`(
  l.table_name IN (
    'employee',
    'employee_phone',
    'employee_email',
    'role',
    'permission',
    'role_permission'
  )
  OR l.action IN (
    'BRANCH_MANAGER_SET',
    'BRANCH_MANAGER_CLEAR'
  )
)`;

function parameter(query, key, max = 100) {
  const value = query[key] ?? '';

  if (
    typeof value !== 'string' ||
    value.length > max
  ) {
    fail(400, `Invalid ${key}`);
  }

  return value.trim();
}

function validDate(value) {
  if (!value) return;

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    fail(400, 'Invalid date');
  }
}

function staffSensitive(row) {
  return [
    'employee',
    'employee_phone',
    'employee_email',
    'role',
    'permission',
    'role_permission'
  ].includes(row.table_name) || [
    'BRANCH_MANAGER_SET',
    'BRANCH_MANAGER_CLEAR'
  ].includes(row.action);
}

export const getAuditFilters = endpoint(async (req, res) => {
  const scope = req.employeeScope;

  const [branches, actions, tables] = await Promise.all([
    prisma.branch.findMany({
      where: scope.allBranches
        ? {}
        : { ifsc_code: scope.branchIfsc },

      select: {
        ifsc_code: true,
        branch_name: true
      },

      orderBy: { branch_name: 'asc' }
    }),

    prisma.$queryRaw`
      SELECT DISTINCT l.action
      FROM audit_log l
      WHERE ${OWN_SCOPE(scope)}
      ORDER BY l.action
    `,

    prisma.$queryRaw`
      SELECT DISTINCT l.table_name
      FROM audit_log l
      WHERE ${OWN_SCOPE(scope)}
      ORDER BY l.table_name
    `
  ]);

  res.json({
    branches: branches.map(row => ({
      ifscCode: row.ifsc_code,
      name: row.branch_name
    })),

    actions: actions.map(row => row.action),
    tables: tables.map(row => row.table_name)
  });
});

export const listAuditEntries = endpoint(async (req, res) => {
  const scope = req.employeeScope;

  const action = parameter(req.query, 'action', 40);
  const table = parameter(req.query, 'table', 40);
  const record = parameter(req.query, 'recordId', 40);
  const employeeId = parameter(req.query, 'employeeId', 10);
  const from = parameter(req.query, 'fromDate', 10);
  const to = parameter(req.query, 'toDate', 10);
  const branch = parameter(req.query, 'branchIfsc', 11);
  const attribution = parameter(req.query, 'scope', 10);

  const pageText = parameter(req.query, 'page', 4) || '1';
  const page = Number(pageText);

  if (
    !/^[1-9]\d*$/.test(pageText) ||
    !Number.isSafeInteger(page) ||
    page > 1000
  ) {
    fail(400, 'Invalid page');
  }

  if (action && !/^[A-Z][A-Z0-9_]{0,39}$/.test(action)) {
    fail(400, 'Invalid action');
  }

  if (table && !/^[a-z][a-z0-9_]{0,39}$/.test(table)) {
    fail(400, 'Invalid table');
  }

  if (
    employeeId &&
    (
      !/^[1-9]\d{0,9}$/.test(employeeId) ||
      Number(employeeId) > 2147483647
    )
  ) {
    fail(400, 'Invalid employee ID');
  }

  validDate(from);
  validDate(to);

  if (from && to && from > to) {
    fail(400, 'Start date must not follow end date');
  }

  if (branch && !/^[A-Z0-9]{11}$/.test(branch)) {
    fail(400, 'Invalid branch');
  }

  if (
    branch &&
    !scope.allBranches &&
    branch !== scope.branchIfsc
  ) {
    fail(403, 'Cannot access another branch');
  }

  if (!['', 'SCOPED', 'UNSCOPED'].includes(attribution)) {
    fail(400, 'Invalid branch attribution filter');
  }

  if (attribution === 'UNSCOPED' && !scope.allBranches) {
    fail(403, 'Unscoped entries are available to Admin only');
  }

  const flags = await prisma.$queryRaw`
    SELECT
      fn_has_permission(
        ${req.user.id}, 'VIEW_PERSONAL_INFO'
      ) AS personal,
      fn_has_permission(
        ${req.user.id}, 'MANAGE_EMPLOYEES'
      ) AS manage,
      fn_has_permission(
        ${req.user.id}, 'VIEW_EMPLOYEE_ROLES'
      ) AS directory
  `;

  const personal = Number(flags[0].personal) === 1;
  const manage = Number(flags[0].manage) === 1;
  const directory =
    manage || Number(flags[0].directory) === 1;

  const clauses = [OWN_SCOPE(scope)];

  if (action) {
    clauses.push(Prisma.sql`l.action = ${action}`);
  }

  if (table) {
    clauses.push(Prisma.sql`l.table_name = ${table}`);
  }

  if (record) {
    clauses.push(Prisma.sql`l.record_id = ${record}`);
  }

  if (employeeId) {
    clauses.push(Prisma.sql`l.emp_id = ${Number(employeeId)}`);
  }

  if (from) {
    clauses.push(Prisma.sql`
      l.created_at >= ${from + ' 00:00:00'}
    `);
  }

  if (to) {
    clauses.push(Prisma.sql`
      l.created_at <= ${to + ' 23:59:59'}
    `);
  }

  if (branch) {
    clauses.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM audit_log_branch s
        WHERE s.log_id = l.log_id
          AND s.branch_ifsc = ${branch}
      )
    `);
  }

  if (attribution === 'SCOPED') {
    clauses.push(Prisma.sql`
      EXISTS (
        SELECT 1 FROM audit_log_branch s
        WHERE s.log_id = l.log_id
      )
    `);
  }

  if (attribution === 'UNSCOPED') {
    clauses.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1 FROM audit_log_branch s
        WHERE s.log_id = l.log_id
      )
    `);
  }

  const where = Prisma.join(clauses, ' AND ');

  const detailsAllowed = Prisma.sql`(
    (
      (${STAFF_SENSITIVE} AND ${manage ? 1 : 0} = 1)
      OR
      (NOT ${STAFF_SENSITIVE} AND ${personal ? 1 : 0} = 1)
    )
    AND (
      ${scope.allBranches ? 1 : 0} = 1
      OR (
        EXISTS (
          SELECT 1 FROM audit_log_branch s
          WHERE s.log_id = l.log_id
            AND s.branch_ifsc = ${scope.branchIfsc}
        )
        AND NOT EXISTS (
          SELECT 1 FROM audit_log_branch s
          WHERE s.log_id = l.log_id
            AND s.branch_ifsc <> ${scope.branchIfsc}
        )
      )
    )
  )`;

  const [rows, counts] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        v.log_id,
        v.emp_id,
        v.action,
        v.table_name,
        v.record_id,
        DATE_FORMAT(
          v.created_at, '%Y-%m-%d %H:%i:%s'
        ) AS recorded_at,
        v.actor_name,
        v.actor_branch,
        v.scope_count,
        v.details_visible,

        CASE WHEN v.details_visible = 1
          THEN v.old_value ELSE NULL
        END AS old_value,

        CASE WHEN v.details_visible = 1
          THEN v.new_value ELSE NULL
        END AS new_value,

        CASE WHEN v.details_visible = 1
          THEN v.details ELSE NULL
        END AS details

      FROM (
        SELECT
          l.log_id,
          l.emp_id,
          l.action,
          l.table_name,
          l.record_id,
          l.created_at,
          l.old_value,
          l.new_value,
          l.details,
          e.branch_ifsc AS actor_branch,

          ${detailsAllowed} AS details_visible,

          (
            SELECT COUNT(*)
            FROM audit_log_branch s
            WHERE s.log_id = l.log_id
          ) AS scope_count,

          CASE
            WHEN ${directory ? 1 : 0} = 1
              AND (
                ${scope.allBranches ? 1 : 0} = 1
                OR e.branch_ifsc = ${scope.branchIfsc}
              )
            THEN e.emp_name
            ELSE NULL
          END AS actor_name

        ${JOINS}
        WHERE ${where}
        ORDER BY l.created_at DESC, l.log_id DESC
        LIMIT 20 OFFSET ${(page - 1) * 20}
      ) v

      ORDER BY v.created_at DESC, v.log_id DESC
    `,

    prisma.$queryRaw`
      SELECT COUNT(*) AS total
      ${JOINS}
      WHERE ${where}
    `
  ]);

  const branches = new Map();

  if (rows.length) {
    const scopes = await prisma.$queryRaw`
      SELECT s.log_id, s.branch_ifsc
      FROM audit_log_branch s
      WHERE s.log_id IN (
        ${Prisma.join(rows.map(row => row.log_id))}
      )
      AND (
        ${scope.allBranches ? 1 : 0} = 1
        OR s.branch_ifsc = ${scope.branchIfsc}
      )
      ORDER BY s.branch_ifsc
    `;

    for (const row of scopes) {
      if (
        !scope.allBranches &&
        row.branch_ifsc !== scope.branchIfsc
      ) {
        continue;
      }

      const key = String(row.log_id);

      if (!branches.has(key)) branches.set(key, []);

      branches.get(key).push(row.branch_ifsc);
    }
  }

  const total = Number(counts[0].total);

  res.json({
    entries: rows.map(row => {
      const codes = branches.get(String(row.log_id)) ?? [];

      const visible =
        Number(row.details_visible) === 1 &&
        (staffSensitive(row) ? manage : personal) &&
        (
          scope.allBranches ||
          (
            Number(row.scope_count) === 1 &&
            codes.includes(scope.branchIfsc)
          )
        );

      return {
        logId: String(row.log_id),
        employeeId: row.emp_id,

        actorName:
          directory &&
          (
            scope.allBranches ||
            row.actor_branch === scope.branchIfsc
          )
            ? row.actor_name
            : null,

        action: row.action,
        table: row.table_name,
        recordId: row.record_id,
        date: row.recorded_at,
        branches: codes,
        scopeRecorded: Number(row.scope_count) > 0,
        detailsVisible: visible,

        ...(visible ? {
          oldValue: row.old_value,
          newValue: row.new_value,
          details: row.details
        } : {})
      };
    }),

    page,
    total,
    totalPages: Math.min(1000, Math.ceil(total / 20)),
    refineFilters: total > 20000
  });
});