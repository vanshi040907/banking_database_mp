-- Run once (safe to repeat). Adds permissions for advanced DBIS demonstrations.
USE bank_db;
INSERT INTO permission (perm_code, description) VALUES
 ('MANAGE_FD','Create and mature fixed deposits'),
 ('APPROVE_LOAN','Approve and disburse loans')
ON DUPLICATE KEY UPDATE description=VALUES(description);
INSERT IGNORE INTO role_permission(role_id,perm_id)
SELECT r.role_id,p.perm_id FROM role r JOIN permission p
WHERE (r.role_name IN ('MANAGER','ADMIN') AND p.perm_code IN ('MANAGE_FD','APPROVE_LOAN'));
