USE bank_db;

DROP PROCEDURE IF EXISTS sp_set_account_status;
DROP PROCEDURE IF EXISTS sp_close_account;

DELIMITER $$

CREATE PROCEDURE sp_set_account_status(
    IN p_acc BIGINT UNSIGNED,
    IN p_new VARCHAR(10),
    IN p_emp INT,
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_emp_branch CHAR(11) DEFAULT NULL;
    DECLARE v_branch CHAR(11) DEFAULT NULL;
    DECLARE v_old VARCHAR(10) DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_acc IS NULL
       OR p_emp IS NULL
       OR p_new IS NULL
       OR p_new NOT IN ('ACTIVE', 'FROZEN') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid status request';
    END IF;

    IF p_reason IS NULL
       OR CHAR_LENGTH(TRIM(p_reason)) < 5 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A reason of at least five characters is required';
    END IF;

    START TRANSACTION;

    SELECT branch_ifsc INTO v_emp_branch
    FROM employee
    WHERE emp_id = p_emp AND status = 'ACTIVE'
    FOR SHARE;

    IF v_emp_branch IS NULL
       OR NOT fn_has_permission(p_emp, 'FREEZE_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Permission denied';
    END IF;

    SELECT branch_ifsc, status
    INTO v_branch, v_old
    FROM account
    WHERE acc_no = p_acc
    FOR UPDATE;

    IF v_old IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account not found';
    END IF;

    IF NOT fn_has_permission(p_emp, 'ACCESS_ALL_BRANCHES')
       AND v_branch <> v_emp_branch THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account not found';
    END IF;

    IF v_old = 'CLOSED' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A closed account cannot be changed';
    END IF;

    IF v_old = p_new THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account already has that status';
    END IF;

    UPDATE account
    SET status = p_new
    WHERE acc_no = p_acc;

    INSERT INTO audit_log (
        emp_id, action, table_name, record_id,
        old_value, new_value, details
    )
    VALUES (
        p_emp,
        IF(p_new = 'FROZEN', 'FREEZE', 'UNFREEZE'),
        'account',
        CAST(p_acc AS CHAR),
        v_old,
        p_new,
        TRIM(p_reason)
    );

    COMMIT;
END$$

CREATE PROCEDURE sp_close_account(
    IN p_acc BIGINT UNSIGNED,
    IN p_emp INT,
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_emp_branch CHAR(11) DEFAULT NULL;
    DECLARE v_branch CHAR(11) DEFAULT NULL;
    DECLARE v_cust INT DEFAULT NULL;
    DECLARE v_locked_cust INT DEFAULT NULL;
    DECLARE v_old VARCHAR(10) DEFAULT NULL;
    DECLARE v_balance DECIMAL(15,2);
    DECLARE v_primary BOOLEAN;
    DECLARE v_next BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_fd INT DEFAULT NULL;
    DECLARE v_loan INT DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_acc IS NULL OR p_emp IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid closure request';
    END IF;

    IF p_reason IS NULL
       OR CHAR_LENGTH(TRIM(p_reason)) < 5 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A reason of at least five characters is required';
    END IF;

    START TRANSACTION;

    SELECT branch_ifsc INTO v_emp_branch
    FROM employee
    WHERE emp_id = p_emp AND status = 'ACTIVE'
    FOR SHARE;

    IF v_emp_branch IS NULL
       OR NOT fn_has_permission(p_emp, 'CLOSE_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Permission denied';
    END IF;

    SELECT cust_id INTO v_cust
    FROM account
    WHERE acc_no = p_acc;

    IF v_cust IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account not found';
    END IF;

    -- Coordinate primary-account changes with account opening.
    SELECT cust_id INTO v_locked_cust
    FROM customer
    WHERE cust_id = v_cust
    FOR UPDATE;

    SELECT cust_id, branch_ifsc, status, balance, is_primary
    INTO v_locked_cust, v_branch, v_old, v_balance, v_primary
    FROM account
    WHERE acc_no = p_acc
    FOR UPDATE;

    IF v_old IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account not found';
    END IF;

    IF v_locked_cust <> v_cust THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account ownership changed; refresh and retry';
    END IF;

    IF NOT fn_has_permission(p_emp, 'ACCESS_ALL_BRANCHES')
       AND v_branch <> v_emp_branch THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account not found';
    END IF;

    IF v_old = 'CLOSED' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account is already closed';
    END IF;

    IF v_balance <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Balance must be zero before closing';
    END IF;

    BEGIN
        DECLARE CONTINUE HANDLER FOR NOT FOUND
            SET v_fd = NULL;

        SELECT fd_id INTO v_fd
        FROM fixed_deposit
        WHERE linked_acc_no = p_acc AND status = 'ACTIVE'
        ORDER BY fd_id
        LIMIT 1
        FOR UPDATE;
    END;

    IF v_fd IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Resolve linked active fixed deposits before closing';
    END IF;

    BEGIN
        DECLARE CONTINUE HANDLER FOR NOT FOUND
            SET v_loan = NULL;

        SELECT loan_id INTO v_loan
        FROM loan
        WHERE disbursed_acc_no = p_acc
          AND status <> 'CLOSED'
        ORDER BY loan_id
        LIMIT 1
        FOR UPDATE;
    END;

    IF v_loan IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Resolve linked loans before closing';
    END IF;

    UPDATE account
    SET
        status = 'CLOSED',
        closed_date = CURRENT_DATE,
        is_primary = FALSE
    WHERE acc_no = p_acc;

    IF v_primary THEN
        UPDATE account
        SET is_primary = FALSE
        WHERE cust_id = v_cust AND is_primary = TRUE;

        BEGIN
            DECLARE CONTINUE HANDLER FOR NOT FOUND
                SET v_next = NULL;

            SELECT acc_no INTO v_next
            FROM account
            WHERE cust_id = v_cust AND status = 'ACTIVE'
            ORDER BY creation_date, acc_no
            LIMIT 1
            FOR UPDATE;
        END;

        IF v_next IS NOT NULL THEN
            UPDATE account
            SET is_primary = TRUE
            WHERE acc_no = v_next;
        END IF;
    END IF;

    INSERT INTO audit_log (
        emp_id, action, table_name, record_id,
        old_value, new_value, details
    )
    SELECT
        p_emp,
        'CARD_BLOCK',
        'card',
        CAST(card_id AS CHAR),
        'ACTIVE',
        'BLOCKED',
        CONCAT('Linked account ', p_acc, ' closed')
    FROM card
    WHERE acc_no = p_acc AND status = 'ACTIVE';

    UPDATE card
    SET status = 'BLOCKED'
    WHERE acc_no = p_acc AND status = 'ACTIVE';

    INSERT INTO audit_log (
        emp_id, action, table_name, record_id,
        old_value, new_value, details
    )
    VALUES (
        p_emp, 'ACCOUNT_CLOSE', 'account',
        CAST(p_acc AS CHAR), v_old, 'CLOSED', TRIM(p_reason)
    );

    COMMIT;
END$$

DELIMITER ;