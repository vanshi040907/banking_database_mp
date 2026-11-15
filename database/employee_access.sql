USE bank_db;

-- Remove cross-branch access from every non-admin role.
DELETE rp
FROM role_permission rp
JOIN role r ON r.role_id = rp.role_id
JOIN permission p ON p.perm_id = rp.perm_id
WHERE p.perm_code = 'ACCESS_ALL_BRANCHES'
  AND r.role_name <> 'ADMIN';

-- Keep the mapping table informative for existing permissions.
INSERT IGNORE INTO role_permission (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM role r
CROSS JOIN permission p
WHERE r.role_name = 'ADMIN';

DROP FUNCTION IF EXISTS fn_has_permission;

DELIMITER $$

CREATE FUNCTION fn_has_permission(
    p_emp INT,
    p_code VARCHAR(40)
)
RETURNS TINYINT(1)
READS SQL DATA
SQL SECURITY DEFINER
BEGIN
    DECLARE v_allowed TINYINT DEFAULT 0;

    SELECT EXISTS (
        SELECT 1
        FROM employee e
        JOIN role r
          ON r.role_id = e.role_id
        JOIN permission p
          ON p.perm_code = p_code
        LEFT JOIN role_permission rp
          ON rp.role_id = r.role_id
         AND rp.perm_id = p.perm_id
        WHERE e.emp_id = p_emp
          AND e.status = 'ACTIVE'
          AND (
              r.role_name = 'ADMIN'
              OR (
                  p.perm_code <> 'ACCESS_ALL_BRANCHES'
                  AND rp.perm_id IS NOT NULL
              )
          )
    ) INTO v_allowed;

    RETURN v_allowed;
END$$

DELIMITER ;