-- View, permission function, stored procedures and triggers. Run after schema.sql.
USE bank_db;

-- Every transaction seen from each account's side (used for account history).
CREATE VIEW v_transaction_history AS
SELECT trans_id, reference_no, trans_date, trans_type, trans_mode, amount, trans_status, remarks,
       from_acc_no AS acc_no, 'DEBIT' AS direction, to_acc_no AS counterparty_acc_no
FROM bank_transaction WHERE from_acc_no IS NOT NULL
UNION ALL
SELECT trans_id, reference_no, trans_date, trans_type, trans_mode, amount, trans_status, remarks,
       to_acc_no, 'CREDIT', from_acc_no
FROM bank_transaction WHERE to_acc_no IS NOT NULL;

DELIMITER $$

-- 1 if the employee is active and their role has the permission (ADMIN has all).
CREATE FUNCTION fn_has_permission(p_emp INT, p_code VARCHAR(40))
RETURNS TINYINT(1)
READS SQL DATA
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM employee e
        JOIN role r ON r.role_id = e.role_id
        WHERE e.emp_id = p_emp AND e.status = 'ACTIVE'
          AND (r.role_name = 'ADMIN'
               OR (p_code <> 'ACCESS_ALL_BRANCHES'
                   AND EXISTS (SELECT 1 FROM role_permission rp
                               JOIN permission p ON p.perm_id = rp.perm_id
                               WHERE rp.role_id = r.role_id AND p.perm_code = p_code)))
    );
END$$

-- Cash deposit or withdrawal at the counter. Repeating the same key returns the first result.
CREATE PROCEDURE sp_cash_operation(
    IN p_emp INT, IN p_acc BIGINT UNSIGNED, IN p_kind VARCHAR(10),
    IN p_amount DECIMAL(15,2), IN p_remarks VARCHAR(255), IN p_key CHAR(36),
    OUT p_trans_id BIGINT)
BEGIN
    DECLARE v_emp_branch CHAR(11);
    DECLARE v_branch CHAR(11);
    DECLARE v_status VARCHAR(10);
    DECLARE v_balance, v_after DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    SET p_trans_id = NULL;
    IF p_amount IS NULL OR p_amount <= 0 OR p_kind NOT IN ('DEPOSIT','WITHDRAWAL') OR CHAR_LENGTH(p_key) <> 36 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid cash request';
    END IF;

    START TRANSACTION;
    SELECT branch_ifsc INTO v_emp_branch FROM employee WHERE emp_id = p_emp AND status = 'ACTIVE';
    IF v_emp_branch IS NULL
       OR NOT fn_has_permission(p_emp, IF(p_kind = 'DEPOSIT', 'CASH_DEPOSIT', 'CASH_WITHDRAW')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cash permission denied';
    END IF;

    SELECT branch_ifsc, status, balance INTO v_branch, v_status, v_balance
    FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_status IS NULL OR (v_branch <> v_emp_branch AND NOT fn_has_permission(p_emp, 'ACCESS_ALL_BRANCHES')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not found';
    END IF;

    SELECT trans_id INTO p_trans_id FROM cash_operation_request WHERE emp_id = p_emp AND request_key = p_key;
    IF p_trans_id IS NULL THEN
        IF v_status <> 'ACTIVE' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account is not active';
        END IF;
        IF p_kind = 'WITHDRAWAL' AND v_balance < p_amount THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance';
        END IF;

        SET v_after = IF(p_kind = 'DEPOSIT', v_balance + p_amount, v_balance - p_amount);
        UPDATE account SET balance = v_after WHERE acc_no = p_acc;
        INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, initiated_by, remarks)
        VALUES (IF(p_kind = 'WITHDRAWAL', p_acc, NULL), IF(p_kind = 'DEPOSIT', p_acc, NULL),
                p_kind, 'CASH', p_amount, p_emp, p_remarks);
        SET p_trans_id = LAST_INSERT_ID();

        INSERT INTO cash_operation_request (emp_id, request_key, acc_no, trans_id, balance_before, balance_after)
        VALUES (p_emp, p_key, p_acc, p_trans_id, v_balance, v_after);
        INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
        VALUES (p_emp, IF(p_kind = 'DEPOSIT', 'CASH_DEPOSIT', 'CASH_WITHDRAWAL'), 'bank_transaction',
                CAST(p_trans_id AS CHAR), CAST(v_balance AS CHAR), CAST(v_after AS CHAR),
                CONCAT('Account ', p_acc, '; ', COALESCE(p_remarks, '')));
    END IF;
    COMMIT;
END$$

CREATE PROCEDURE sp_cash_deposit(
    IN p_emp INT, IN p_acc BIGINT UNSIGNED, IN p_amount DECIMAL(15,2),
    IN p_remarks VARCHAR(255), IN p_key CHAR(36), OUT p_trans_id BIGINT)
BEGIN
    CALL sp_cash_operation(p_emp, p_acc, 'DEPOSIT', p_amount, p_remarks, p_key, p_trans_id);
END$$

CREATE PROCEDURE sp_cash_withdraw(
    IN p_emp INT, IN p_acc BIGINT UNSIGNED, IN p_amount DECIMAL(15,2),
    IN p_remarks VARCHAR(255), IN p_key CHAR(36), OUT p_trans_id BIGINT)
BEGIN
    CALL sp_cash_operation(p_emp, p_acc, 'WITHDRAWAL', p_amount, p_remarks, p_key, p_trans_id);
END$$

-- Customer transfer. The key is stored as the transaction's reference_no, so a retry
-- of the same request returns the original transaction instead of moving money twice.
CREATE PROCEDURE sp_secure_transfer(
    IN p_cust INT, IN p_from BIGINT UNSIGNED, IN p_to BIGINT UNSIGNED,
    IN p_amount DECIMAL(15,2), IN p_remarks VARCHAR(255), IN p_key CHAR(36),
    OUT p_trans_id BIGINT)
BEGIN
    DECLARE v_from_status, v_to_status VARCHAR(10);
    DECLARE v_owner INT;
    DECLARE v_balance DECIMAL(15,2);
    DECLARE v_old_from, v_old_to BIGINT UNSIGNED;
    DECLARE v_old_amount DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_amount IS NULL OR p_amount <= 0 OR p_from IS NULL OR p_to IS NULL OR CHAR_LENGTH(p_key) <> 36 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid transfer request';
    END IF;
    IF p_from = p_to THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot transfer to the same account';
    END IF;

    START TRANSACTION;
    -- lock both accounts, lowest number first, so opposite transfers cannot deadlock
    IF p_from < p_to THEN
        SELECT status, cust_id, balance INTO v_from_status, v_owner, v_balance FROM account WHERE acc_no = p_from FOR UPDATE;
        SELECT status INTO v_to_status FROM account WHERE acc_no = p_to FOR UPDATE;
    ELSE
        SELECT status INTO v_to_status FROM account WHERE acc_no = p_to FOR UPDATE;
        SELECT status, cust_id, balance INTO v_from_status, v_owner, v_balance FROM account WHERE acc_no = p_from FOR UPDATE;
    END IF;

    SELECT trans_id, from_acc_no, to_acc_no, amount INTO p_trans_id, v_old_from, v_old_to, v_old_amount
    FROM bank_transaction WHERE reference_no = p_key;

    IF p_trans_id IS NOT NULL THEN
        IF v_old_from <> p_from OR v_old_to <> p_to OR v_old_amount <> p_amount THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Idempotency key reused with different transfer details';
        END IF;
    ELSE
        IF v_from_status IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sender account not found';
        ELSEIF v_owner <> p_cust THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can only send money from your own account';
        ELSEIF v_from_status <> 'ACTIVE' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account is not active';
        ELSEIF v_to_status IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receiver account not found';
        ELSEIF v_to_status <> 'ACTIVE' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receiver account cannot accept money right now';
        ELSEIF v_balance < p_amount THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance';
        END IF;

        UPDATE account SET balance = balance - p_amount WHERE acc_no = p_from;
        UPDATE account SET balance = balance + p_amount WHERE acc_no = p_to;
        INSERT INTO bank_transaction (reference_no, from_acc_no, to_acc_no, trans_type, trans_mode, amount, remarks)
        VALUES (p_key, p_from, p_to, 'TRANSFER', 'IMPS', p_amount, p_remarks);
        SET p_trans_id = LAST_INSERT_ID();
    END IF;
    COMMIT;
END$$

-- Open an account (plus opening deposit). p_key is accepted for compatibility and not used.
CREATE PROCEDURE sp_open_account(
    IN p_cust INT, IN p_branch CHAR(11), IN p_type INT, IN p_opening DECIMAL(15,2),
    IN p_emp INT, IN p_key CHAR(36), OUT p_acc_no BIGINT UNSIGNED)
BEGIN
    DECLARE v_emp_branch, v_reg_branch, v_branch_status CHAR(11);
    DECLARE v_kyc, v_cust_status VARCHAR(10);
    DECLARE v_all TINYINT;
    DECLARE v_min DECIMAL(15,2);
    DECLARE v_existing INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    SET p_acc_no = NULL;
    IF p_opening IS NULL OR p_opening < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid account opening request';
    END IF;

    START TRANSACTION;
    SELECT branch_ifsc INTO v_emp_branch FROM employee WHERE emp_id = p_emp AND status = 'ACTIVE';
    IF v_emp_branch IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee is not active';
    END IF;
    IF NOT fn_has_permission(p_emp, 'OPEN_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account opening permission denied';
    END IF;
    SET v_all = fn_has_permission(p_emp, 'ACCESS_ALL_BRANCHES');
    IF v_all = 0 AND p_branch <> v_emp_branch THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot open accounts in another branch';
    END IF;

    -- locking the customer row stops two officers creating two "first" accounts at once
    SELECT kyc_status, status, registered_branch_ifsc INTO v_kyc, v_cust_status, v_reg_branch
    FROM customer WHERE cust_id = p_cust FOR UPDATE;
    IF v_cust_status IS NULL
       OR (v_all = 0 AND NOT (v_reg_branch <=> v_emp_branch)
           AND NOT EXISTS (SELECT 1 FROM account WHERE cust_id = p_cust AND branch_ifsc = v_emp_branch)) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer not found in your scope';
    END IF;
    IF v_cust_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer is not active';
    END IF;
    IF v_kyc <> 'VERIFIED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer KYC is not verified';
    END IF;

    SELECT status INTO v_branch_status FROM branch WHERE ifsc_code = p_branch;
    IF v_branch_status IS NULL OR v_branch_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Branch not found or inactive';
    END IF;
    SELECT min_balance INTO v_min FROM account_type WHERE type_id = p_type;
    IF v_min IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account type not found';
    END IF;
    IF p_opening < v_min THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Opening deposit is below the account type minimum';
    END IF;

    SELECT COUNT(*) INTO v_existing FROM account WHERE cust_id = p_cust AND status <> 'CLOSED';
    INSERT INTO account (cust_id, branch_ifsc, type_id, opened_by, balance, validity, is_primary)
    VALUES (p_cust, p_branch, p_type, p_emp, p_opening, DATE_ADD(CURRENT_DATE, INTERVAL 20 YEAR), v_existing = 0);
    SET p_acc_no = LAST_INSERT_ID();

    IF p_opening > 0 THEN
        INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, initiated_by, remarks)
        VALUES (NULL, p_acc_no, 'DEPOSIT', 'CASH', p_opening, p_emp, 'Opening deposit');
    END IF;
    INSERT INTO audit_log (emp_id, action, table_name, record_id, new_value, details)
    VALUES (p_emp, 'ACCOUNT_OPEN', 'account', CAST(p_acc_no AS CHAR), 'ACTIVE',
            CONCAT('Customer ', p_cust, ', opening balance ', p_opening));
    COMMIT;
END$$

-- Freeze or unfreeze an account.
CREATE PROCEDURE sp_set_account_status(
    IN p_acc BIGINT UNSIGNED, IN p_new VARCHAR(10), IN p_emp INT, IN p_reason VARCHAR(255))
BEGIN
    DECLARE v_emp_branch, v_branch CHAR(11);
    DECLARE v_old VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_new IS NULL OR p_new NOT IN ('ACTIVE','FROZEN') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid status request';
    END IF;
    IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason)) < 5 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A reason of at least five characters is required';
    END IF;

    START TRANSACTION;
    SELECT branch_ifsc INTO v_emp_branch FROM employee WHERE emp_id = p_emp AND status = 'ACTIVE';
    IF v_emp_branch IS NULL OR NOT fn_has_permission(p_emp, 'FREEZE_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Permission denied';
    END IF;

    SELECT branch_ifsc, status INTO v_branch, v_old FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_old IS NULL OR (v_branch <> v_emp_branch AND NOT fn_has_permission(p_emp, 'ACCESS_ALL_BRANCHES')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not found';
    ELSEIF v_old = 'CLOSED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A closed account cannot be changed';
    ELSEIF v_old = p_new THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account already has that status';
    END IF;

    UPDATE account SET status = p_new WHERE acc_no = p_acc;
    INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
    VALUES (p_emp, IF(p_new = 'FROZEN', 'FREEZE', 'UNFREEZE'), 'account', CAST(p_acc AS CHAR), v_old, p_new, TRIM(p_reason));
    COMMIT;
END$$

-- Close an account (never deleted). Needs a zero balance and no open FD or loan on it.
CREATE PROCEDURE sp_close_account(IN p_acc BIGINT UNSIGNED, IN p_emp INT, IN p_reason VARCHAR(255))
BEGIN
    DECLARE v_emp_branch, v_branch CHAR(11);
    DECLARE v_cust INT;
    DECLARE v_old VARCHAR(10);
    DECLARE v_balance DECIMAL(15,2);
    DECLARE v_primary BOOLEAN;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason)) < 5 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A reason of at least five characters is required';
    END IF;

    START TRANSACTION;
    SELECT branch_ifsc INTO v_emp_branch FROM employee WHERE emp_id = p_emp AND status = 'ACTIVE';
    IF v_emp_branch IS NULL OR NOT fn_has_permission(p_emp, 'CLOSE_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Permission denied';
    END IF;

    SELECT cust_id, branch_ifsc, status, balance, is_primary INTO v_cust, v_branch, v_old, v_balance, v_primary
    FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_old IS NULL OR (v_branch <> v_emp_branch AND NOT fn_has_permission(p_emp, 'ACCESS_ALL_BRANCHES')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not found';
    ELSEIF v_old = 'CLOSED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account is already closed';
    ELSEIF v_balance <> 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Balance must be zero before closing';
    ELSEIF EXISTS (SELECT 1 FROM fixed_deposit WHERE linked_acc_no = p_acc AND status = 'ACTIVE') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resolve linked active fixed deposits before closing';
    ELSEIF EXISTS (SELECT 1 FROM loan WHERE disbursed_acc_no = p_acc AND status <> 'CLOSED') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resolve linked loans before closing';
    END IF;

    UPDATE account SET status = 'CLOSED', closed_date = CURRENT_DATE, is_primary = FALSE WHERE acc_no = p_acc;
    -- the customer's oldest remaining active account becomes primary
    IF v_primary THEN
        UPDATE account SET is_primary = TRUE
        WHERE cust_id = v_cust AND status = 'ACTIVE' ORDER BY creation_date, acc_no LIMIT 1;
    END IF;

    INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
    SELECT p_emp, 'CARD_BLOCK', 'card', CAST(card_id AS CHAR), 'ACTIVE', 'BLOCKED',
           CONCAT('Linked account ', p_acc, ' closed')
    FROM card WHERE acc_no = p_acc AND status = 'ACTIVE';
    UPDATE card SET status = 'BLOCKED' WHERE acc_no = p_acc AND status = 'ACTIVE';

    INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
    VALUES (p_emp, 'ACCOUNT_CLOSE', 'account', CAST(p_acc AS CHAR), v_old, 'CLOSED', TRIM(p_reason));
    COMMIT;
END$$

-- Place money from the customer's account into a fixed deposit (interest paid at maturity).
CREATE PROCEDURE sp_create_fd(
    IN p_emp INT, IN p_cust INT, IN p_acc BIGINT UNSIGNED, IN p_amount DECIMAL(15,2),
    IN p_rate DECIMAL(5,2), IN p_months INT, OUT p_fd_id INT)
BEGIN
    DECLARE v_owner INT;
    DECLARE v_branch CHAR(11);
    DECLARE v_status, v_kyc VARCHAR(10);
    DECLARE v_balance DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_amount IS NULL OR p_amount <= 0 OR p_rate IS NULL OR p_rate <= 0 OR p_months IS NULL OR p_months <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid FD amount, rate, or term';
    END IF;
    IF NOT fn_has_permission(p_emp, 'MANAGE_FD') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee cannot manage FDs';
    END IF;

    START TRANSACTION;
    SELECT cust_id, branch_ifsc, status, balance INTO v_owner, v_branch, v_status, v_balance
    FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_owner IS NULL OR v_owner <> p_cust OR v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not owned by customer or inactive';
    END IF;
    SELECT kyc_status INTO v_kyc FROM customer WHERE cust_id = p_cust;
    IF v_kyc <> 'VERIFIED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'KYC must be verified';
    END IF;
    IF v_balance < p_amount THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance for FD';
    END IF;

    UPDATE account SET balance = balance - p_amount WHERE acc_no = p_acc;
    INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, initiated_by, remarks)
    VALUES (p_acc, NULL, 'WITHDRAWAL', 'IMPS', p_amount, p_emp, 'FD placement');
    INSERT INTO fixed_deposit (cust_id, branch_ifsc, linked_acc_no, amount, int_rate_fd, duration_months, start_date)
    VALUES (p_cust, v_branch, p_acc, p_amount, p_rate, p_months, CURRENT_DATE);
    SET p_fd_id = LAST_INSERT_ID();
    INSERT INTO audit_log (emp_id, action, table_name, record_id, new_value, details)
    VALUES (p_emp, 'FD_CREATE', 'fixed_deposit', CAST(p_fd_id AS CHAR), 'ACTIVE', CONCAT('Principal ', p_amount));
    COMMIT;
END$$

-- Pay out a matured fixed deposit: principal + simple interest (amount * rate * months / 1200).
CREATE PROCEDURE sp_mature_fd(IN p_emp INT, IN p_fd_id INT, OUT p_trans_id BIGINT)
BEGIN
    DECLARE v_acc BIGINT UNSIGNED;
    DECLARE v_principal, v_total DECIMAL(15,2);
    DECLARE v_rate DECIMAL(5,2);
    DECLARE v_months INT;
    DECLARE v_start DATE;
    DECLARE v_status, v_acc_status VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF NOT fn_has_permission(p_emp, 'MANAGE_FD') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee cannot mature FDs';
    END IF;

    START TRANSACTION;
    SELECT linked_acc_no, amount, int_rate_fd, duration_months, start_date, status
    INTO v_acc, v_principal, v_rate, v_months, v_start, v_status
    FROM fixed_deposit WHERE fd_id = p_fd_id FOR UPDATE;
    IF v_acc IS NULL OR v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FD not found or not active';
    END IF;
    IF CURRENT_DATE < DATE_ADD(v_start, INTERVAL v_months MONTH) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FD has not reached maturity';
    END IF;
    SELECT status INTO v_acc_status FROM account WHERE acc_no = v_acc FOR UPDATE;
    IF v_acc_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linked account not active';
    END IF;

    SET v_total = v_principal + ROUND(v_principal * v_rate * v_months / 1200, 2);
    UPDATE account SET balance = balance + v_total WHERE acc_no = v_acc;
    INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, initiated_by, remarks)
    VALUES (NULL, v_acc, 'DEPOSIT', 'IMPS', v_total, p_emp, CONCAT('FD maturity #', p_fd_id));
    SET p_trans_id = LAST_INSERT_ID();
    INSERT INTO fd_payout (fd_id, payout_kind, payout_date, amount, credited_trans_id)
    VALUES (p_fd_id, 'MATURITY', CURRENT_DATE, v_total, p_trans_id);
    UPDATE fixed_deposit SET status = 'MATURED' WHERE fd_id = p_fd_id;
    INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
    VALUES (p_emp, 'FD_MATURE', 'fixed_deposit', CAST(p_fd_id AS CHAR), 'ACTIVE', 'MATURED', CONCAT('Paid ', v_total));
    COMMIT;
END$$

-- Approve a PENDING loan and credit the customer's account in the same branch.
CREATE PROCEDURE sp_disburse_loan(IN p_emp INT, IN p_loan_id INT, IN p_acc BIGINT UNSIGNED, OUT p_trans_id BIGINT)
BEGIN
    DECLARE v_cust, v_owner INT;
    DECLARE v_branch, v_acc_branch CHAR(11);
    DECLARE v_principal DECIMAL(15,2);
    DECLARE v_status, v_acc_status VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF NOT fn_has_permission(p_emp, 'APPROVE_LOAN') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee cannot approve loans';
    END IF;

    START TRANSACTION;
    SELECT cust_id, branch_ifsc, principle_amt, status INTO v_cust, v_branch, v_principal, v_status
    FROM loan WHERE loan_id = p_loan_id FOR UPDATE;
    IF v_cust IS NULL OR v_status <> 'PENDING' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Loan not found or not pending';
    END IF;
    SELECT cust_id, branch_ifsc, status INTO v_owner, v_acc_branch, v_acc_status
    FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_owner IS NULL OR v_owner <> v_cust OR v_acc_status <> 'ACTIVE' OR v_acc_branch <> v_branch THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Disbursement account invalid';
    END IF;

    UPDATE account SET balance = balance + v_principal WHERE acc_no = p_acc;
    INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, initiated_by, remarks)
    VALUES (NULL, p_acc, 'DEPOSIT', 'IMPS', v_principal, p_emp, CONCAT('Loan disbursement #', p_loan_id));
    SET p_trans_id = LAST_INSERT_ID();
    UPDATE loan SET approved_by = p_emp, disbursed_acc_no = p_acc, status = 'ACTIVE',
                    outstanding_amount = principle_amt
    WHERE loan_id = p_loan_id;
    INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
    VALUES (p_emp, 'LOAN_DISBURSE', 'loan', CAST(p_loan_id AS CHAR), 'PENDING', 'ACTIVE', CONCAT('Amount ', v_principal));
    COMMIT;
END$$

-- Pay one EMI from the customer's account. outstanding_amount tracks unpaid principal.
CREATE PROCEDURE sp_pay_emi(IN p_cust INT, IN p_emi_id INT, IN p_acc BIGINT UNSIGNED, OUT p_trans_id BIGINT)
BEGIN
    DECLARE v_loan, v_owner, v_acc_owner INT;
    DECLARE v_due, v_principal, v_outstanding, v_balance DECIMAL(15,2);
    DECLARE v_emi_status, v_loan_status, v_acc_status VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT loan_id INTO v_loan FROM loan_emi_schedule WHERE emi_id = p_emi_id;
    IF v_loan IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EMI not found';
    END IF;
    -- lock the loan first so two EMIs of the same loan cannot be paid at once
    SELECT cust_id, status, outstanding_amount INTO v_owner, v_loan_status, v_outstanding
    FROM loan WHERE loan_id = v_loan FOR UPDATE;
    IF v_owner <> p_cust OR v_loan_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Loan not active or not owned by customer';
    END IF;
    SELECT emi_amount, principal_part, status INTO v_due, v_principal, v_emi_status
    FROM loan_emi_schedule WHERE emi_id = p_emi_id FOR UPDATE;
    IF v_emi_status NOT IN ('PENDING','OVERDUE') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EMI already paid';
    END IF;
    SELECT cust_id, status, balance INTO v_acc_owner, v_acc_status, v_balance
    FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_acc_owner IS NULL OR v_acc_owner <> p_cust OR v_acc_status <> 'ACTIVE' OR v_balance < v_due THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account invalid or insufficient balance';
    END IF;

    UPDATE account SET balance = balance - v_due WHERE acc_no = p_acc;
    INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, remarks)
    VALUES (p_acc, NULL, 'WITHDRAWAL', 'IMPS', v_due, CONCAT('Loan EMI #', p_emi_id));
    SET p_trans_id = LAST_INSERT_ID();
    INSERT INTO loan_payment (loan_id, emi_id, trans_id, amount, pay_mode)
    VALUES (v_loan, p_emi_id, p_trans_id, v_due, 'ACCOUNT_DEBIT');
    UPDATE loan_emi_schedule SET status = 'PAID' WHERE emi_id = p_emi_id;
    UPDATE loan SET outstanding_amount = outstanding_amount - v_principal WHERE loan_id = v_loan;
    IF v_outstanding - v_principal = 0
       AND NOT EXISTS (SELECT 1 FROM loan_emi_schedule WHERE loan_id = v_loan AND status <> 'PAID') THEN
        UPDATE loan SET status = 'CLOSED' WHERE loan_id = v_loan;
    END IF;
    COMMIT;
END$$

-- Triggers that protect money records.
CREATE TRIGGER trg_prevent_account_delete BEFORE DELETE ON account FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Do not DELETE bank accounts; close them instead';
END$$

CREATE TRIGGER trg_prevent_transaction_delete BEFORE DELETE ON bank_transaction FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Financial transaction history cannot be deleted';
END$$

CREATE TRIGGER trg_protect_transaction_update BEFORE UPDATE ON bank_transaction FOR EACH ROW
BEGIN
    IF OLD.trans_status = 'SUCCESS'
       AND (NOT (OLD.from_acc_no <=> NEW.from_acc_no) OR NOT (OLD.to_acc_no <=> NEW.to_acc_no)
            OR OLD.amount <> NEW.amount OR OLD.trans_type <> NEW.trans_type
            OR OLD.trans_mode <> NEW.trans_mode OR OLD.reference_no <> NEW.reference_no
            OR OLD.trans_status <> NEW.trans_status OR OLD.trans_date <> NEW.trans_date) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Successful transaction financial fields are immutable';
    END IF;
END$$

-- Record which branch each audit entry belongs to (the audit page filters on this).
CREATE TRIGGER trg_audit_branch AFTER INSERT ON audit_log FOR EACH ROW
BEGIN
    DECLARE v BIGINT UNSIGNED;

    IF NEW.table_name = 'branch' THEN
        INSERT IGNORE INTO audit_log_branch SELECT NEW.log_id, ifsc_code FROM branch WHERE ifsc_code = NEW.record_id;
    ELSEIF NEW.record_id REGEXP '^[0-9]{1,18}$' THEN
        SET v = CAST(NEW.record_id AS UNSIGNED);
        IF NEW.table_name = 'account' THEN
            INSERT IGNORE INTO audit_log_branch SELECT NEW.log_id, branch_ifsc FROM account WHERE acc_no = v;
        ELSEIF NEW.table_name = 'bank_transaction' THEN
            INSERT IGNORE INTO audit_log_branch
            SELECT DISTINCT NEW.log_id, a.branch_ifsc FROM bank_transaction t
            JOIN account a ON a.acc_no IN (t.from_acc_no, t.to_acc_no) WHERE t.trans_id = v;
        ELSEIF NEW.table_name = 'card' THEN
            INSERT IGNORE INTO audit_log_branch
            SELECT NEW.log_id, a.branch_ifsc FROM card c JOIN account a ON a.acc_no = c.acc_no WHERE c.card_id = v;
        ELSEIF NEW.table_name = 'card_unblock_request' THEN
            INSERT IGNORE INTO audit_log_branch
            SELECT NEW.log_id, a.branch_ifsc FROM card_unblock_request r
            JOIN card c ON c.card_id = r.card_id JOIN account a ON a.acc_no = c.acc_no WHERE r.request_id = v;
        ELSEIF NEW.table_name = 'customer' THEN
            INSERT IGNORE INTO audit_log_branch
            SELECT NEW.log_id, registered_branch_ifsc FROM customer WHERE cust_id = v AND registered_branch_ifsc IS NOT NULL;
            INSERT IGNORE INTO audit_log_branch SELECT DISTINCT NEW.log_id, branch_ifsc FROM account WHERE cust_id = v;
        ELSEIF NEW.table_name = 'employee' THEN
            INSERT IGNORE INTO audit_log_branch SELECT NEW.log_id, branch_ifsc FROM employee WHERE emp_id = v;
        ELSEIF NEW.table_name = 'fixed_deposit' THEN
            INSERT IGNORE INTO audit_log_branch SELECT NEW.log_id, branch_ifsc FROM fixed_deposit WHERE fd_id = v;
        ELSEIF NEW.table_name = 'loan' THEN
            INSERT IGNORE INTO audit_log_branch SELECT NEW.log_id, branch_ifsc FROM loan WHERE loan_id = v;
        END IF;
    END IF;
END$$

-- Triggers that write audit entries for changes made outside the stored procedures.
CREATE TRIGGER trg_employee_role_audit AFTER UPDATE ON employee FOR EACH ROW
BEGIN
    IF NOT (OLD.role_id <=> NEW.role_id) THEN
        INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
        VALUES (NULL, 'EMP_ROLE_CHANGE', 'employee', CAST(NEW.emp_id AS CHAR),
                CAST(OLD.role_id AS CHAR), CAST(NEW.role_id AS CHAR), 'Role changed');
    END IF;
END$$

CREATE TRIGGER trg_customer_kyc_audit AFTER UPDATE ON customer FOR EACH ROW
BEGIN
    IF NOT (OLD.kyc_status <=> NEW.kyc_status) THEN
        INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
        VALUES (NULL, 'KYC_CHANGE', 'customer', CAST(NEW.cust_id AS CHAR),
                OLD.kyc_status, NEW.kyc_status, 'KYC status changed');
    END IF;
END$$

CREATE TRIGGER trg_loan_payment_audit AFTER INSERT ON loan_payment FOR EACH ROW
BEGIN
    INSERT INTO audit_log (emp_id, action, table_name, record_id, new_value, details)
    VALUES (NULL, 'LOAN_PAYMENT', 'loan_payment', CAST(NEW.pay_id AS CHAR), CAST(NEW.amount AS CHAR),
            CONCAT('Loan ', NEW.loan_id, ', EMI ', COALESCE(CAST(NEW.emi_id AS CHAR), 'none')));
END$$

-- The audit log can only be added to.
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_log FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit entries cannot be updated';
END$$

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_log FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit entries cannot be deleted';
END$$

CREATE TRIGGER trg_audit_branch_no_update BEFORE UPDATE ON audit_log_branch FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit branch records cannot be updated';
END$$

CREATE TRIGGER trg_audit_branch_no_delete BEFORE DELETE ON audit_log_branch FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit branch records cannot be deleted';
END$$

DELIMITER ;
