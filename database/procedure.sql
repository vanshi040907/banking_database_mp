-- =====================================================================
--  Bank DB : procedures.sql   (run AFTER schema.sql, BEFORE seed.sql)
--  Every procedure = ONE atomic transaction (all steps or nothing).
--  Re-runnable: each object is dropped first.
-- =====================================================================
USE bank_db;

DROP FUNCTION  IF EXISTS fn_has_permission;
DROP PROCEDURE IF EXISTS sp_cash_deposit;
DROP PROCEDURE IF EXISTS sp_cash_withdraw;
DROP PROCEDURE IF EXISTS sp_transfer;
DROP PROCEDURE IF EXISTS sp_open_account;
DROP PROCEDURE IF EXISTS sp_close_account;
DROP PROCEDURE IF EXISTS sp_set_account_status;
DROP PROCEDURE IF EXISTS sp_set_primary_account;
DROP PROCEDURE IF EXISTS sp_create_fd;
DROP PROCEDURE IF EXISTS sp_mature_fd;
DROP PROCEDURE IF EXISTS sp_disburse_loan;
DROP PROCEDURE IF EXISTS sp_pay_emi;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Does this employee's role include this permission?  (1 = yes, 0 = no)
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_has_permission(p_emp INT, p_code VARCHAR(40))
RETURNS TINYINT(1)
READS SQL DATA
BEGIN
    DECLARE v_cnt INT DEFAULT 0;
    SELECT COUNT(*) INTO v_cnt
      FROM employee e
      JOIN role_permission rp ON rp.role_id = e.role_id
      JOIN permission p       ON p.perm_id  = rp.perm_id
     WHERE e.emp_id = p_emp AND e.status = 'ACTIVE' AND p.perm_code = p_code;
    RETURN v_cnt > 0;
END$$

-- ---------------------------------------------------------------------
-- CASHIER: cash deposit into an account
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_cash_deposit(
    IN  p_emp     INT,
    IN  p_acc     BIGINT UNSIGNED,
    IN  p_amount  DECIMAL(15,2),
    IN  p_remarks VARCHAR(255),
    OUT p_trans_id BIGINT)
BEGIN
    DECLARE v_status VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_amount <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Amount must be positive';
    END IF;
    IF NOT fn_has_permission(p_emp, 'CASH_DEPOSIT') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You do not have permission to deposit cash';
    END IF;

    START TRANSACTION;
    SELECT status INTO v_status FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not found';
    ELSEIF v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account is not active';
    END IF;

    UPDATE account SET balance = balance + p_amount WHERE acc_no = p_acc;
    INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, initiated_by, remarks)
    VALUES (NULL, p_acc, 'DEPOSIT', 'CASH', p_amount, p_emp, p_remarks);
    SET p_trans_id = LAST_INSERT_ID();
    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- CASHIER: cash withdrawal
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_cash_withdraw(
    IN  p_emp     INT,
    IN  p_acc     BIGINT UNSIGNED,
    IN  p_amount  DECIMAL(15,2),
    IN  p_remarks VARCHAR(255),
    OUT p_trans_id BIGINT)
BEGIN
    DECLARE v_status  VARCHAR(10);
    DECLARE v_balance DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_amount <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Amount must be positive';
    END IF;
    IF NOT fn_has_permission(p_emp, 'CASH_WITHDRAW') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You do not have permission to withdraw cash';
    END IF;

    START TRANSACTION;
    SELECT status, balance INTO v_status, v_balance FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not found';
    ELSEIF v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account is not active';
    ELSEIF v_balance < p_amount THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance';
    END IF;

    UPDATE account SET balance = balance - p_amount WHERE acc_no = p_acc;
    INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, initiated_by, remarks)
    VALUES (p_acc, NULL, 'WITHDRAWAL', 'CASH', p_amount, p_emp, p_remarks);
    SET p_trans_id = LAST_INSERT_ID();
    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- CUSTOMER: transfer between two accounts (the flagship transaction)
--   * p_cust is the logged-in customer: proves the sender account is theirs
--   * rows are locked in ascending acc_no order, so A->B and B->A at the
--     same moment can never deadlock each other
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_transfer(
    IN  p_cust    INT,
    IN  p_from    BIGINT UNSIGNED,
    IN  p_to      BIGINT UNSIGNED,
    IN  p_amount  DECIMAL(15,2),
    IN  p_mode    VARCHAR(10),
    IN  p_remarks VARCHAR(255),
    OUT p_trans_id BIGINT)
BEGIN
    DECLARE v_from_status VARCHAR(10);
    DECLARE v_to_status   VARCHAR(10);
    DECLARE v_owner       INT;
    DECLARE v_balance     DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_amount <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Amount must be positive';
    END IF;
    IF p_from = p_to THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot transfer to the same account';
    END IF;

    START TRANSACTION;
    IF p_from < p_to THEN
        SELECT status, cust_id, balance INTO v_from_status, v_owner, v_balance
          FROM account WHERE acc_no = p_from FOR UPDATE;
        SELECT status INTO v_to_status FROM account WHERE acc_no = p_to FOR UPDATE;
    ELSE
        SELECT status INTO v_to_status FROM account WHERE acc_no = p_to FOR UPDATE;
        SELECT status, cust_id, balance INTO v_from_status, v_owner, v_balance
          FROM account WHERE acc_no = p_from FOR UPDATE;
    END IF;

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
    INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, remarks)
    VALUES (p_from, p_to, 'TRANSFER', p_mode, p_amount, p_remarks);
    SET p_trans_id = LAST_INSERT_ID();
    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- ACCOUNT OFFICER: open an account (account + opening deposit + audit)
--   Customer's first account automatically becomes the primary account.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_open_account(
    IN  p_cust    INT,
    IN  p_branch  CHAR(11),
    IN  p_type    INT,
    IN  p_opening DECIMAL(15,2),
    IN  p_emp     INT,
    OUT p_acc_no  BIGINT UNSIGNED)
BEGIN
    DECLARE v_kyc      VARCHAR(10);
    DECLARE v_cstatus  VARCHAR(10);
    DECLARE v_existing INT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_opening < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Opening balance cannot be negative';
    END IF;
    IF NOT fn_has_permission(p_emp, 'OPEN_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You do not have permission to open accounts';
    END IF;

    START TRANSACTION;
    -- locking the customer row stops two officers creating two "first" accounts at once
    SELECT kyc_status, status INTO v_kyc, v_cstatus FROM customer WHERE cust_id = p_cust FOR UPDATE;
    IF v_kyc IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer not found';
    ELSEIF v_kyc <> 'VERIFIED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer KYC is not verified';
    ELSEIF v_cstatus <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer is not active';
    END IF;

    SELECT COUNT(*) INTO v_existing FROM account WHERE cust_id = p_cust AND status <> 'CLOSED';

    INSERT INTO account (cust_id, branch_ifsc, type_id, opened_by, balance, validity, is_primary)
    VALUES (p_cust, p_branch, p_type, p_emp, p_opening,
            DATE_ADD(CURRENT_DATE, INTERVAL 20 YEAR), (v_existing = 0));
    SET p_acc_no = LAST_INSERT_ID();

    IF p_opening > 0 THEN
        INSERT INTO bank_transaction (from_acc_no, to_acc_no, trans_type, trans_mode, amount, initiated_by, remarks)
        VALUES (NULL, p_acc_no, 'DEPOSIT', 'CASH', p_opening, p_emp, 'Opening deposit');
    END IF;

    INSERT INTO audit_log (emp_id, action, table_name, record_id, new_value, details)
    VALUES (p_emp, 'ACCOUNT_OPEN', 'account', p_acc_no, 'ACTIVE',
            CONCAT('Customer ', p_cust, ', opening balance ', p_opening));
    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- ACCOUNT OFFICER: close an account (never deleted, only status CLOSED)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_close_account(
    IN p_acc    BIGINT UNSIGNED,
    IN p_emp    INT,
    IN p_reason VARCHAR(255))
BEGIN
    DECLARE v_status  VARCHAR(10);
    DECLARE v_balance DECIMAL(15,2);
    DECLARE v_cust    INT;
    DECLARE v_primary BOOLEAN;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF NOT fn_has_permission(p_emp, 'CLOSE_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You do not have permission to close accounts';
    END IF;
    IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason)) < 5 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A reason is required';
    END IF;

    START TRANSACTION;
    SELECT status, balance, cust_id, is_primary INTO v_status, v_balance, v_cust, v_primary
      FROM account WHERE acc_no = p_acc FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not found';
    ELSEIF v_status = 'CLOSED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account is already closed';
    ELSEIF v_balance <> 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Balance must be zero before closing';
    END IF;

    UPDATE account SET status = 'CLOSED', closed_date = CURRENT_DATE, is_primary = FALSE
     WHERE acc_no = p_acc;

    -- if it was the primary account, promote the customer's oldest remaining active account
    IF v_primary THEN
        UPDATE account SET is_primary = TRUE
         WHERE cust_id = v_cust AND status = 'ACTIVE'
         ORDER BY creation_date, acc_no
         LIMIT 1;
    END IF;

    INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
    VALUES (p_emp, 'ACCOUNT_CLOSE', 'account', p_acc, v_status, 'CLOSED', p_reason);
    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- MANAGER: freeze / unfreeze (status change + audit in one transaction)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_set_account_status(
    IN p_acc    BIGINT UNSIGNED,
    IN p_new    VARCHAR(10),            -- 'ACTIVE' or 'FROZEN'
    IN p_emp    INT,
    IN p_reason VARCHAR(255))
BEGIN
    DECLARE v_old VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_new NOT IN ('ACTIVE','FROZEN') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Status must be ACTIVE or FROZEN';
    END IF;
    IF NOT fn_has_permission(p_emp, 'FREEZE_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You do not have permission to freeze accounts';
    END IF;
    IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason)) < 5 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A reason is required';
    END IF;

    START TRANSACTION;
    SELECT status INTO v_old FROM account WHERE acc_no = p_acc FOR UPDATE;
    IF v_old IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not found';
    ELSEIF v_old = 'CLOSED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A closed account cannot be changed';
    ELSEIF v_old = p_new THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account already has that status';
    END IF;

    UPDATE account SET status = p_new WHERE acc_no = p_acc;
    INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
    VALUES (p_emp, IF(p_new = 'FROZEN', 'FREEZE', 'UNFREEZE'), 'account', p_acc, v_old, p_new, p_reason);
    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- CUSTOMER: choose which account receives money sent to their mobile no.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_set_primary_account(
    IN p_cust INT,
    IN p_acc  BIGINT UNSIGNED)
BEGIN
    DECLARE v_owner  INT;
    DECLARE v_status VARCHAR(10);
    DECLARE v_lock   INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT cust_id INTO v_lock FROM customer WHERE cust_id = p_cust FOR UPDATE;
    SELECT cust_id, status INTO v_owner, v_status FROM account WHERE acc_no = p_acc FOR UPDATE;

    IF v_owner IS NULL OR v_owner <> p_cust THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account not found';
    ELSEIF v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an active account can be primary';
    END IF;

    UPDATE account SET is_primary = (acc_no = p_acc) WHERE cust_id = p_cust;
    COMMIT;
END$$

-- A customer places money from an active account into a fixed deposit.
-- Only AT_MATURITY payouts supported in this simplified educational model.
CREATE PROCEDURE sp_create_fd(
 IN p_emp INT, IN p_cust INT, IN p_acc BIGINT UNSIGNED,
 IN p_amount DECIMAL(15,2), IN p_rate DECIMAL(5,2),
 IN p_months INT, OUT p_fd_id INT)
BEGIN
 DECLARE v_owner INT DEFAULT NULL;
 DECLARE v_branch CHAR(11) DEFAULT NULL;
 DECLARE v_status VARCHAR(10) DEFAULT NULL;
 DECLARE v_balance DECIMAL(15,2) DEFAULT NULL;
 DECLARE v_kyc VARCHAR(10) DEFAULT NULL;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF p_amount IS NULL OR p_amount <= 0 OR p_rate IS NULL OR p_rate <= 0
    OR p_months IS NULL OR p_months <= 0 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid FD amount, rate, or term';
 END IF;
 IF NOT fn_has_permission(p_emp,'MANAGE_FD') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Employee cannot manage FDs';
 END IF;
 START TRANSACTION;
 SELECT cust_id,branch_ifsc,status,balance
 INTO v_owner,v_branch,v_status,v_balance
 FROM account WHERE acc_no=p_acc FOR UPDATE;
 IF v_owner IS NULL OR v_owner<>p_cust OR v_status<>'ACTIVE' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Account not owned by customer or inactive';
 END IF;
 SELECT kyc_status INTO v_kyc FROM customer WHERE cust_id=p_cust;
 IF v_kyc <> 'VERIFIED' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='KYC must be verified';
 END IF;
 IF v_balance<p_amount THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Insufficient balance for FD';
 END IF;
 UPDATE account SET balance=balance-p_amount WHERE acc_no=p_acc;
 -- This schema has no FD-placement transaction type; WITHDRAWAL is used as a
 -- simplified ledger representation. A production ledger needs distinct types.
 INSERT INTO bank_transaction(from_acc_no,to_acc_no,trans_type,trans_mode,amount,initiated_by,remarks)
 VALUES(p_acc,NULL,'WITHDRAWAL','IMPS',p_amount,p_emp,'FD placement');
 INSERT INTO fixed_deposit(cust_id,branch_ifsc,linked_acc_no,amount,int_rate_fd,duration_months,start_date,payout_type,status)
 VALUES(p_cust,v_branch,p_acc,p_amount,p_rate,p_months,CURRENT_DATE,'AT_MATURITY','ACTIVE');
 SET p_fd_id=LAST_INSERT_ID();
 INSERT INTO audit_log(emp_id,action,table_name,record_id,new_value,details)
 VALUES(p_emp,'FD_CREATE','fixed_deposit',CAST(p_fd_id AS CHAR),'ACTIVE',CONCAT('Principal ',p_amount));
 COMMIT;
END$$

-- Educational simple interest: principal * annual rate * months / 1200.
-- For genuine products, day-count, taxes, compounding and payout schedules differ.
CREATE PROCEDURE sp_mature_fd(IN p_emp INT, IN p_fd_id INT, OUT p_trans_id BIGINT)
BEGIN
 DECLARE v_acc BIGINT UNSIGNED DEFAULT NULL;
 DECLARE v_principal DECIMAL(15,2);
 DECLARE v_rate DECIMAL(5,2);
 DECLARE v_months INT;
 DECLARE v_start DATE;
 DECLARE v_status VARCHAR(10);
 DECLARE v_acc_status VARCHAR(10);
 DECLARE v_interest DECIMAL(15,2);
 DECLARE v_total DECIMAL(15,2);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF NOT fn_has_permission(p_emp,'MANAGE_FD') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Employee cannot mature FDs';
 END IF;
 START TRANSACTION;
 SELECT linked_acc_no,amount,int_rate_fd,duration_months,start_date,status
 INTO v_acc,v_principal,v_rate,v_months,v_start,v_status
 FROM fixed_deposit WHERE fd_id=p_fd_id FOR UPDATE;
 IF v_acc IS NULL OR v_status<>'ACTIVE' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FD not found or not active';
 END IF;
 IF CURRENT_DATE < DATE_ADD(v_start, INTERVAL v_months MONTH) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FD has not reached maturity';
 END IF;
 SELECT status INTO v_acc_status FROM account WHERE acc_no=v_acc FOR UPDATE;
 IF v_acc_status<>'ACTIVE' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Linked account not active';
 END IF;
 SET v_interest=ROUND(v_principal*v_rate*v_months/1200,2);
 SET v_total=v_principal+v_interest;
 UPDATE account SET balance=balance+v_total WHERE acc_no=v_acc;
 INSERT INTO bank_transaction(from_acc_no,to_acc_no,trans_type,trans_mode,amount,initiated_by,remarks)
 VALUES(NULL,v_acc,'DEPOSIT','IMPS',v_total,p_emp,CONCAT('FD maturity #',p_fd_id));
 SET p_trans_id=LAST_INSERT_ID();
 INSERT INTO fd_payout(fd_id,payout_kind,payout_date,amount,credited_trans_id)
 VALUES(p_fd_id,'MATURITY',CURRENT_DATE,v_total,p_trans_id);
 UPDATE fixed_deposit SET status='MATURED' WHERE fd_id=p_fd_id;
 INSERT INTO audit_log(emp_id,action,table_name,record_id,old_value,new_value,details)
 VALUES(p_emp,'FD_MATURE','fixed_deposit',CAST(p_fd_id AS CHAR),'ACTIVE','MATURED',CONCAT('Paid ',v_total));
 COMMIT;
END$$

-- Approve an existing PENDING loan and credit its disbursement account.
-- EMI schedules must be created separately before EMI payments are allowed.
CREATE PROCEDURE sp_disburse_loan(IN p_emp INT, IN p_loan_id INT, IN p_acc BIGINT UNSIGNED, OUT p_trans_id BIGINT)
BEGIN
 DECLARE v_cust INT DEFAULT NULL;
 DECLARE v_branch CHAR(11);
 DECLARE v_principal DECIMAL(15,2);
 DECLARE v_status VARCHAR(10);
 DECLARE v_owner INT DEFAULT NULL;
 DECLARE v_acc_branch CHAR(11);
 DECLARE v_acc_status VARCHAR(10);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF NOT fn_has_permission(p_emp,'APPROVE_LOAN') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Employee cannot approve loans';
 END IF;
 START TRANSACTION;
 SELECT cust_id,branch_ifsc,principle_amt,status INTO v_cust,v_branch,v_principal,v_status
 FROM loan WHERE loan_id=p_loan_id FOR UPDATE;
 IF v_cust IS NULL OR v_status<>'PENDING' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Loan not found or not pending';
 END IF;
 SELECT cust_id,branch_ifsc,status INTO v_owner,v_acc_branch,v_acc_status
 FROM account WHERE acc_no=p_acc FOR UPDATE;
 IF v_owner IS NULL OR v_owner<>v_cust OR v_acc_status<>'ACTIVE' OR v_acc_branch<>v_branch THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Disbursement account invalid';
 END IF;
 UPDATE account SET balance=balance+v_principal WHERE acc_no=p_acc;
 INSERT INTO bank_transaction(from_acc_no,to_acc_no,trans_type,trans_mode,amount,initiated_by,remarks)
 VALUES(NULL,p_acc,'DEPOSIT','IMPS',v_principal,p_emp,CONCAT('Loan disbursement #',p_loan_id));
 SET p_trans_id=LAST_INSERT_ID();
 UPDATE loan SET approved_by=p_emp,disbursed_acc_no=p_acc,status='ACTIVE',outstanding_amount=principle_amt
 WHERE loan_id=p_loan_id;
 INSERT INTO audit_log(emp_id,action,table_name,record_id,old_value,new_value,details)
 VALUES(p_emp,'LOAN_DISBURSE','loan',CAST(p_loan_id AS CHAR),'PENDING','ACTIVE',CONCAT('Amount ',v_principal));
 COMMIT;
END$$

-- Pay exactly one scheduled EMI from an account owned by the loan customer.
-- Loan outstanding_amount here tracks unpaid PRINCIPAL, not interest.
CREATE PROCEDURE sp_pay_emi(IN p_cust INT, IN p_emi_id INT, IN p_acc BIGINT UNSIGNED, OUT p_trans_id BIGINT)
BEGIN
 DECLARE v_loan INT DEFAULT NULL;
 DECLARE v_due DECIMAL(15,2);
 DECLARE v_principal DECIMAL(15,2);
 DECLARE v_emi_status VARCHAR(10);
 DECLARE v_loan_status VARCHAR(10);
 DECLARE v_owner INT;
 DECLARE v_acc_owner INT DEFAULT NULL;
 DECLARE v_acc_status VARCHAR(10);
 DECLARE v_balance DECIMAL(15,2);
 DECLARE v_outstanding DECIMAL(15,2);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 START TRANSACTION;
 -- Lock loan before EMI; prevents concurrent EMI payments on same loan.
 SELECT loan_id INTO v_loan FROM loan_emi_schedule WHERE emi_id=p_emi_id;
 IF v_loan IS NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EMI not found';
 END IF;
 SELECT cust_id,status,outstanding_amount INTO v_owner,v_loan_status,v_outstanding
 FROM loan WHERE loan_id=v_loan FOR UPDATE;
 IF v_owner<>p_cust OR v_loan_status<>'ACTIVE' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Loan not active or not owned by customer';
 END IF;
 SELECT emi_amount,principal_part,status INTO v_due,v_principal,v_emi_status
 FROM loan_emi_schedule WHERE emi_id=p_emi_id AND loan_id=v_loan FOR UPDATE;
 IF v_emi_status NOT IN ('PENDING','OVERDUE') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EMI already paid';
 END IF;
 IF v_principal>v_outstanding THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Principal schedule exceeds outstanding loan';
 END IF;
 SELECT cust_id,status,balance INTO v_acc_owner,v_acc_status,v_balance
 FROM account WHERE acc_no=p_acc FOR UPDATE;
 IF v_acc_owner IS NULL OR v_acc_owner<>p_cust OR v_acc_status<>'ACTIVE' OR v_balance<v_due THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Account invalid or insufficient balance';
 END IF;
 UPDATE account SET balance=balance-v_due WHERE acc_no=p_acc;
 INSERT INTO bank_transaction(from_acc_no,to_acc_no,trans_type,trans_mode,amount,remarks)
 VALUES(p_acc,NULL,'WITHDRAWAL','IMPS',v_due,CONCAT('Loan EMI #',p_emi_id));
 SET p_trans_id=LAST_INSERT_ID();
 INSERT INTO loan_payment(loan_id,emi_id,trans_id,amount,pay_mode)
 VALUES(v_loan,p_emi_id,p_trans_id,v_due,'ACCOUNT_DEBIT');
 UPDATE loan_emi_schedule SET status='PAID' WHERE emi_id=p_emi_id;
 UPDATE loan SET outstanding_amount=outstanding_amount-v_principal WHERE loan_id=v_loan;
 IF NOT EXISTS(SELECT 1 FROM loan_emi_schedule WHERE loan_id=v_loan AND status<>'PAID')
    AND (v_outstanding-v_principal)=0 THEN
  UPDATE loan SET status='CLOSED' WHERE loan_id=v_loan;
 END IF;
 COMMIT;
END$$

DELIMITER ;