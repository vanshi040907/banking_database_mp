USE bank_db;

CREATE TABLE IF NOT EXISTS account_open_request (
    emp_id INT NOT NULL,
    request_key CHAR(36) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    acc_no BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (emp_id, request_key),

    FOREIGN KEY (emp_id) REFERENCES employee(emp_id),
    FOREIGN KEY (acc_no) REFERENCES account(acc_no)
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS sp_open_account;

DELIMITER $$

CREATE PROCEDURE sp_open_account(
    IN p_cust INT,
    IN p_branch CHAR(11),
    IN p_type INT,
    IN p_opening DECIMAL(15,2),
    IN p_emp INT,
    IN p_key CHAR(36),
    OUT p_acc_no BIGINT UNSIGNED
)
BEGIN
    DECLARE v_emp_branch CHAR(11) DEFAULT NULL;
    DECLARE v_registered_branch CHAR(11) DEFAULT NULL;
    DECLARE v_all TINYINT DEFAULT 0;
    DECLARE v_kyc VARCHAR(10) DEFAULT NULL;
    DECLARE v_customer_status VARCHAR(10) DEFAULT NULL;
    DECLARE v_branch_status VARCHAR(10) DEFAULT NULL;
    DECLARE v_minimum DECIMAL(15,2) DEFAULT NULL;
    DECLARE v_existing_acc BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_hash CHAR(64);
    DECLARE v_saved_hash CHAR(64);
    DECLARE v_saved_acc BIGINT UNSIGNED DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_acc_no = NULL;

    IF p_cust IS NULL
       OR p_branch IS NULL
       OR p_type IS NULL
       OR p_emp IS NULL
       OR p_opening IS NULL
       OR p_opening < 0
       OR p_key IS NULL
       OR CHAR_LENGTH(p_key) <> 36 THEN

        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid account opening request';
    END IF;

    SET v_hash = SHA2(
        JSON_ARRAY(
            p_cust,
            p_branch,
            p_type,
            CAST(p_opening AS CHAR)
        ),
        256
    );

    START TRANSACTION;

    SELECT branch_ifsc INTO v_emp_branch
    FROM employee
    WHERE emp_id = p_emp
      AND status = 'ACTIVE'
    FOR SHARE;

    IF v_emp_branch IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee is not active';
    END IF;

    IF NOT fn_has_permission(p_emp, 'OPEN_ACCOUNT') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account opening permission denied';
    END IF;

    SET v_all = fn_has_permission(
        p_emp, 'ACCESS_ALL_BRANCHES'
    );

    IF v_all = 0 AND p_branch <> v_emp_branch THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot open accounts in another branch';
    END IF;

    SELECT kyc_status, status, registered_branch_ifsc
    INTO v_kyc, v_customer_status, v_registered_branch
    FROM customer
    WHERE cust_id = p_cust
    FOR UPDATE;

    IF v_customer_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Customer not found in your scope';
    END IF;

    IF v_all = 0
       AND NOT (v_registered_branch <=> v_emp_branch)
       AND NOT EXISTS (
           SELECT 1
           FROM account
           WHERE cust_id = p_cust
             AND branch_ifsc = v_emp_branch
       ) THEN

        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Customer not found in your scope';
    END IF;

    INSERT INTO account_open_request (
        emp_id, request_key, request_hash
    )
    VALUES (
        p_emp, p_key, v_hash
    )
    ON DUPLICATE KEY UPDATE request_hash = request_hash;

    SELECT request_hash, acc_no
    INTO v_saved_hash, v_saved_acc
    FROM account_open_request
    WHERE emp_id = p_emp
      AND request_key = p_key
    FOR UPDATE;

    IF v_saved_hash <> v_hash THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Request key reused with different account details';
    END IF;

    IF v_saved_acc IS NOT NULL THEN
        SET p_acc_no = v_saved_acc;

    ELSE
        IF v_customer_status <> 'ACTIVE' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Customer is not active';
        END IF;

        IF v_kyc <> 'VERIFIED' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Customer KYC is not verified';
        END IF;

        SELECT status INTO v_branch_status
        FROM branch
        WHERE ifsc_code = p_branch
        FOR SHARE;

        IF v_branch_status IS NULL
           OR v_branch_status <> 'ACTIVE' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Branch not found or inactive';
        END IF;

        SELECT min_balance INTO v_minimum
        FROM account_type
        WHERE type_id = p_type
        FOR SHARE;

        IF v_minimum IS NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Account type not found';
        END IF;

        IF p_opening < v_minimum THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Opening deposit is below the account type minimum';
        END IF;

        -- Read the latest account state after obtaining
        -- the customer lock.
        BEGIN
            DECLARE CONTINUE HANDLER FOR NOT FOUND
                SET v_existing_acc = NULL;

            SELECT acc_no INTO v_existing_acc
            FROM account
            WHERE cust_id = p_cust
              AND status <> 'CLOSED'
            ORDER BY acc_no
            LIMIT 1
            FOR UPDATE;
        END;

        INSERT INTO account (
            cust_id,
            branch_ifsc,
            type_id,
            opened_by,
            balance,
            validity,
            is_primary
        )
        VALUES (
            p_cust,
            p_branch,
            p_type,
            p_emp,
            p_opening,
            DATE_ADD(CURRENT_DATE, INTERVAL 20 YEAR),
            v_existing_acc IS NULL
        );

        SET p_acc_no = LAST_INSERT_ID();

        IF p_opening > 0 THEN
            INSERT INTO bank_transaction (
                from_acc_no,
                to_acc_no,
                trans_type,
                trans_mode,
                amount,
                initiated_by,
                remarks
            )
            VALUES (
                NULL,
                p_acc_no,
                'DEPOSIT',
                'CASH',
                p_opening,
                p_emp,
                'Opening deposit'
            );
        END IF;

        INSERT INTO audit_log (
            emp_id,
            action,
            table_name,
            record_id,
            new_value,
            details
        )
        VALUES (
            p_emp,
            'ACCOUNT_OPEN',
            'account',
            p_acc_no,
            'ACTIVE',
            CONCAT(
                'Customer ', p_cust,
                ', opening balance ', p_opening
            )
        );

        UPDATE account_open_request
        SET acc_no = p_acc_no
        WHERE emp_id = p_emp
          AND request_key = p_key;

    END IF;

    COMMIT;
END$$

DELIMITER ;