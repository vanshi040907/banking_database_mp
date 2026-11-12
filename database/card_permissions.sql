
USE bank_db;

-- Permission to issue a bank card
INSERT INTO permission (perm_code, description)
VALUES (
    'ISSUE_CARD',
    'Issue debit and credit cards'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description);

-- Give this permission to authorized employee roles
INSERT IGNORE INTO role_permission (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM role r
JOIN permission p
WHERE r.role_name IN (
    'ACCOUNT_OFFICER',
    'MANAGER',
    'ADMIN'
)
AND p.perm_code = 'ISSUE_CARD';


-- Permission to update card spending limits
INSERT INTO permission (perm_code, description)
VALUES (
    'UPDATE_CARD_LIMIT',
    'Update card daily spending limits'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description);

-- Allow account officers, managers and admins
INSERT IGNORE INTO role_permission (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM role r
JOIN permission p
WHERE r.role_name IN (
    'ACCOUNT_OFFICER',
    'MANAGER',
    'ADMIN'
)
AND p.perm_code = 'UPDATE_CARD_LIMIT';
