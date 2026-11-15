-- Starter data. Run after logic.sql. Password hashes are dummies; scripts/set-test-passwords.js sets real ones.
USE bank_db;

INSERT INTO location (pincode, city, state) VALUES
('452001', 'Indore', 'Madhya Pradesh'),
('462001', 'Bhopal', 'Madhya Pradesh');

INSERT INTO branch (ifsc_code, branch_name, address_line, pincode, establishment_date) VALUES
('IIT00000001', 'Indore Main',     'AB Road, Vijay Nagar', '452001', '2005-04-12'),
('IIT00000002', 'Bhopal MP Nagar', 'Zone 1, MP Nagar',     '462001', '2010-09-01');

INSERT INTO role (role_name, description) VALUES
('ACCOUNT_OFFICER',  'Verifies KYC, registers customers, opens and closes accounts'),
('ANALYST',          'Views accounts and transactions'),
('CUSTOMER_SERVICE', 'Edits customer details'),
('CASHIER',          'Cash deposits and withdrawals'),
('MANAGER',          'Freezes accounts, approves loans and fixed deposits'),
('ADMIN',            'Manages staff; all permissions in every branch');

INSERT INTO permission (perm_code, description) VALUES
('REGISTER_CUSTOMER',     'Register a new customer'),
('OPEN_ACCOUNT',          'Open a new account'),
('CLOSE_ACCOUNT',         'Close an account'),
('VIEW_ACCOUNTS',         'View account balances and status'),
('VIEW_ALL_TRANSACTIONS', 'View transactions'),
('VIEW_PERSONAL_INFO',    'View customer personal details'),
('EDIT_CUSTOMER_DETAILS', 'Edit customer address, phone, email'),
('CASH_DEPOSIT',          'Record a cash deposit'),
('CASH_WITHDRAW',         'Record a cash withdrawal'),
('FREEZE_ACCOUNT',        'Freeze or unfreeze an account'),
('VIEW_EMPLOYEE_ROLES',   'View employees and their roles'),
('MANAGE_EMPLOYEES',      'Create employees and change roles'),
('VIEW_AUDIT_LOG',        'View the audit log'),
('ISSUE_CARD',            'Issue debit and credit cards'),
('UPDATE_CARD_LIMIT',     'Change card daily limits'),
('UNBLOCK_CARD',          'Review card unblock requests'),
('MANAGE_FD',             'Create and mature fixed deposits'),
('APPROVE_LOAN',          'Approve and disburse loans'),
('ACCESS_ALL_BRANCHES',   'See data of every branch (ADMIN only)');

INSERT INTO role_permission (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM role r JOIN permission p ON
     (r.role_name = 'ACCOUNT_OFFICER'  AND p.perm_code IN ('REGISTER_CUSTOMER','OPEN_ACCOUNT','CLOSE_ACCOUNT','VIEW_ACCOUNTS','VIEW_PERSONAL_INFO','ISSUE_CARD','UPDATE_CARD_LIMIT','UNBLOCK_CARD'))
  OR (r.role_name = 'ANALYST'          AND p.perm_code IN ('VIEW_ACCOUNTS','VIEW_ALL_TRANSACTIONS'))
  OR (r.role_name = 'CUSTOMER_SERVICE' AND p.perm_code IN ('VIEW_ACCOUNTS','VIEW_PERSONAL_INFO','EDIT_CUSTOMER_DETAILS'))
  OR (r.role_name = 'CASHIER'          AND p.perm_code IN ('VIEW_ACCOUNTS','CASH_DEPOSIT','CASH_WITHDRAW'))
  OR (r.role_name = 'MANAGER'          AND p.perm_code IN ('VIEW_ACCOUNTS','VIEW_ALL_TRANSACTIONS','VIEW_PERSONAL_INFO','FREEZE_ACCOUNT','VIEW_EMPLOYEE_ROLES','VIEW_AUDIT_LOG','ISSUE_CARD','UPDATE_CARD_LIMIT','UNBLOCK_CARD','MANAGE_FD','APPROVE_LOAN'))
  OR (r.role_name = 'ADMIN');

INSERT INTO employee (branch_ifsc, role_id, emp_name, gender, dob, designation, salary, join_date, password_hash, must_change_password) VALUES
('IIT00000001', (SELECT role_id FROM role WHERE role_name='MANAGER'),          'Ramesh Verma', 'M', '1980-05-10', 'Branch Manager',     95000, '2012-06-01', '$2b$10$dummyhash', FALSE),
('IIT00000001', (SELECT role_id FROM role WHERE role_name='ACCOUNT_OFFICER'),  'Neha Sharma',  'F', '1993-08-22', 'Account Officer',    42000, '2018-01-15', '$2b$10$dummyhash', FALSE),
('IIT00000001', (SELECT role_id FROM role WHERE role_name='CASHIER'),          'Rahul Mehta',  'M', '1995-03-14', 'Cashier',            32000, '2020-07-01', '$2b$10$dummyhash', FALSE),
('IIT00000001', (SELECT role_id FROM role WHERE role_name='ANALYST'),          'Priya Nair',   'F', '1991-11-30', 'Data Analyst',       55000, '2019-04-10', '$2b$10$dummyhash', FALSE),
('IIT00000001', (SELECT role_id FROM role WHERE role_name='CUSTOMER_SERVICE'), 'Karan Singh',  'M', '1994-06-18', 'Customer Service',   34000, '2021-02-01', '$2b$10$dummyhash', FALSE),
('IIT00000002', (SELECT role_id FROM role WHERE role_name='MANAGER'),          'Amit Joshi',   'M', '1982-02-17', 'Branch Manager',     90000, '2014-03-10', '$2b$10$dummyhash', FALSE),
('IIT00000002', (SELECT role_id FROM role WHERE role_name='ACCOUNT_OFFICER'),  'Sunita Rao',   'F', '1990-09-05', 'Account Officer',    41000, '2017-05-20', '$2b$10$dummyhash', FALSE),
('IIT00000001', (SELECT role_id FROM role WHERE role_name='ADMIN'),            'Sys Admin',    'O', '1989-01-01', 'Administrator',      80000, '2016-07-01', '$2b$10$dummyhash', FALSE);

UPDATE branch SET manager_id = 1 WHERE ifsc_code = 'IIT00000001';
UPDATE branch SET manager_id = 6 WHERE ifsc_code = 'IIT00000002';

INSERT INTO employee_phone VALUES
(1,'+919800000001'),(2,'+919800000002'),(3,'+919800000003'),(4,'+919800000004'),
(5,'+919800000005'),(6,'+919800000006'),(7,'+919800000007'),(8,'+919800000008');
INSERT INTO employee_email VALUES
(1,'ramesh@bank.in'),(2,'neha@bank.in'),(3,'rahul@bank.in'),(4,'priya@bank.in'),
(5,'karan@bank.in'),(6,'amit@bank.in'),(7,'sunita@bank.in'),(8,'admin@bank.in');

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
INSERT INTO customer (name, dob, gender, address_line, pincode, id_proof_type, id_proof_no, kyc_status, password_hash, must_change_password, registered_branch_ifsc) VALUES
('Vanshika Agrawal', '2005-02-14', 'F', 'Vijay Nagar, Indore', '452001', 'AADHAAR',  '1111-2222-3333', 'VERIFIED', '$2b$10$dummyhash', FALSE, 'IIT00000001'),
('Sushmita Patil',   '2005-07-21', 'F', 'Palasia, Indore',     '452001', 'AADHAAR',  '3333-4444-5555', 'VERIFIED', '$2b$10$dummyhash', FALSE, 'IIT00000001'),
('Adi Jain',         '2005-11-03', 'M', 'MP Nagar, Bhopal',    '462001', 'AADHAAR',  '5555-6666-7777', 'VERIFIED', '$2b$10$dummyhash', FALSE, 'IIT00000002'),
('Vishruth Agrawal', '2004-12-30', 'M', 'Vijay Nagar, Indore', '452001', 'PASSPORT', 'P1234567',       'VERIFIED', '$2b$10$dummyhash', FALSE, 'IIT00000001');

INSERT INTO customer_phone (cust_id, ph_no, is_primary) VALUES
(1,'+919900000001',TRUE),(2,'+919900000002',TRUE),(3,'+919900000003',TRUE),(4,'+919900000004',TRUE);
INSERT INTO customer_email (cust_id, mail, is_primary) VALUES
(1,'vanshika@mail.com',TRUE),(2,'sushmita@mail.com',TRUE),(3,'adi@mail.com',TRUE),(4,'vishruth@mail.com',TRUE);

INSERT INTO account_type (type_name, min_balance, interest_rate, daily_txn_limit) VALUES
('SAVINGS', 1000, 3.50, 100000),
('CURRENT', 5000, 0.00, 500000),
('SALARY',     0, 3.00, 100000);

-- Accounts and money movement go through the stored procedures.
-- sp_open_account(customer, branch, type, opening balance, employee, key, OUT acc_no)
CALL sp_open_account(1, 'IIT00000001', 1,  50000, 2, UUID(), @a1);
CALL sp_open_account(2, 'IIT00000001', 1,  25000, 2, UUID(), @a2);
CALL sp_open_account(3, 'IIT00000002', 2, 100000, 7, UUID(), @a3);
CALL sp_open_account(4, 'IIT00000001', 3,  15000, 2, UUID(), @a4);
CALL sp_open_account(1, 'IIT00000001', 2,  10000, 2, UUID(), @a5);

-- sp_cash_deposit / sp_cash_withdraw(cashier, account, amount, remarks, key, OUT trans_id)
-- sp_secure_transfer(customer, from, to, amount, remarks, key, OUT trans_id)
CALL sp_cash_deposit (3, @a1,  5000, 'Cash deposit at counter', UUID(), @t);
CALL sp_secure_transfer(1, @a1, @a2,  1200, 'Dinner split',    UUID(), @t);
CALL sp_secure_transfer(2, @a2, @a1,   300, 'Returned change', UUID(), @t);
CALL sp_secure_transfer(3, @a3, @a1, 30000, 'Rent',            UUID(), @t);
CALL sp_cash_withdraw(3, @a2,  2000, 'Cash withdrawal', UUID(), @t);
CALL sp_secure_transfer(1, @a1, @a4,   500, 'Gift',            UUID(), @t);
