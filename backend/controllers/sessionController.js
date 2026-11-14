import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

export const getSession = wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');

  if (req.user.type !== 'EMPLOYEE') {
    return res.json(req.user);
  }

  const employees = await prisma.$queryRaw`
    SELECT
      e.emp_id,
      e.emp_name,
      e.designation,
      e.branch_ifsc,
      r.role_name,
      b.branch_name
    FROM employee e
    JOIN role r ON r.role_id = e.role_id
    JOIN branch b ON b.ifsc_code = e.branch_ifsc
    WHERE e.emp_id = ${req.user.id}
      AND e.status = 'ACTIVE'
  `;

  const employee = employees[0];

  if (!employee) {
    return res.status(403).json({
      error: 'Employee account is not active'
    });
  }

  const rows = await prisma.$queryRaw`
    SELECT p.perm_code
    FROM permission p
    WHERE fn_has_permission(
      ${req.user.id}, p.perm_code
    ) = 1
    ORDER BY p.perm_code
  `;

  const permissions = rows.map(row => row.perm_code);

  return res.json({
    type: 'EMPLOYEE',
    id: employee.emp_id,
    name: employee.emp_name,
    designation: employee.designation,
    role: employee.role_name,
    branch: {
      ifscCode: employee.branch_ifsc,
      name: employee.branch_name
    },
    permissions,
    scope: permissions.includes('ACCESS_ALL_BRANCHES')
      ? 'ALL_BRANCHES'
      : 'OWN_BRANCH'
  });
});