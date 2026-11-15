import { prisma } from '../db.js';

export async function loadEmployeeScope(req, res, next) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        branch_ifsc,
        fn_has_permission(
          emp_id, 'ACCESS_ALL_BRANCHES'
        ) AS all_branches
      FROM employee
      WHERE emp_id = ${req.user.id}
        AND status = 'ACTIVE'
    `;

    if (!rows[0]) {
      return res.status(403).json({
        error: 'Employee account is not active'
      });
    }

    req.employeeScope = {
      branchIfsc: rows[0].branch_ifsc,
      allBranches: Number(rows[0].all_branches) === 1
    };

    next();
  } catch (error) {
    next(error);
  }
}