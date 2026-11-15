USE bank_db;

-- Remove the unused plain-English search permission.
DELETE rp
FROM role_permission rp
JOIN permission p ON p.perm_id = rp.perm_id
WHERE p.perm_code = 'USE_NL_SEARCH';

DELETE FROM permission
WHERE perm_code = 'USE_NL_SEARCH';

CREATE TABLE IF NOT EXISTS cash_operation_request (
    emp_id INT NOT NULL,
    request_key CHAR(36) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    acc_no BIGINT UNSIGNED NOT NULL,
    trans_id BIGINT NULL UNIQUE,
    balance_before DECIMAL(15,2) NULL,
    balance_after DECIMAL(15,2) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (emp_id, request_key),

    FOREIGN KEY (emp_id) REFERENCES employee(emp_id),
    FOREIGN KEY (acc_no) REFERENCES account(acc_no),
    FOREIGN KEY (trans_id) REFERENCES bank_transaction(trans_id),

    CHECK (balance_before >= 0),
    CHECK (balance_after >= 0)
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS sp_cash_deposit;
DROP PROCEDURE IF EXISTS sp_cash_withdraw;
DROP PROCEDURE IF EXISTS sp_cash_operation;

DELIMITER $$

CREATE PROCEDURE sp_cash_operation(
    IN p_emp INT,
    IN p_acc BIGINT UNSIGNED,
    IN p_kind VARCHAR(10),
    IN p_amount DECIMAL(15,2),
    IN p_remarks VARCHAR(255),
    IN p_key CHAR(36),
    OUT p_trans_id BIGINT
)
BEGIN
    DECLARE v_emp_branch CHAR(11) DEFAULT NULL;
    DECLARE v_branch CHAR(11) DEFAULT NULL;
    DECLARE v_status VARCHAR(10) DEFAULT NULL;
    DECLARE v_balance DECIMAL(15,2);
    DECLARE v_after DECIMAL(15,2);
    DECLARE v_hash CHAR(64);
    DECLARE v_saved_hash CHAR(64);
    DECLARE v_saved_id BIGINT DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_trans_id = NULL;

    IF p_emp IS NULL
       OR p_acc IS NULL
       OR p_kind IS NULL
       OR p_kind NOT IN ('DEPOSIT', 'WITHDRAWAL')
       OR p_amount IS NULL
       OR p_amount <= 0
       OR p_key IS NULL
       OR CHAR_LENGTH(p_key) <> 36 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid cash request';
    END IF;

    SET v_hash = SHA2(
        JSON_ARRAY(
            CAST(p_acc AS CHAR),
            p_kind,
            CAST(p_amount AS CHAR),
            COALESCE(p_remarks, '')
        ),
        256
    );

    START TRANSACTION;

    SELECT branch_ifsc INTO v_emp_branch
    FROM employee
    WHERE emp_id = p_emp AND status = 'ACTIVE'
    FOR SHARE;

    IF v_emp_branch IS NULL
       OR NOT fn_has_permission(
           p_emp,
           IF(
               p_kind = 'DEPOSIT',
               'CASH_DEPOSIT',
               'CASH_WITHDRAW'
           )
       ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cash permission denied';
    END IF;

    SELECT branch_ifsc, status, balance
    INTO v_branch, v_status, v_balance
    FROM account
    WHERE acc_no = p_acc
    FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account not found';
    END IF;

    IF NOT fn_has_permission(p_emp, 'ACCESS_ALL_BRANCHES')
       AND v_branch <> v_emp_branch THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Account not found';
    END IF;

    INSERT INTO cash_operation_request (
        emp_id, request_key, request_hash, acc_no
    )
    VALUES (
        p_emp, p_key, v_hash, p_acc
    )
    ON DUPLICATE KEY UPDATE request_hash = request_hash;

    SELECT request_hash, trans_id
    INTO v_saved_hash, v_saved_id
    FROM cash_operation_request
    WHERE emp_id = p_emp AND request_key = p_key
    FOR UPDATE;

    IF v_saved_hash <> v_hash THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cash request key reused with different details';
    END IF;

    IF v_saved_id IS NOT NULL THEN
        SET p_trans_id = v_saved_id;

    ELSE
        IF v_status <> 'ACTIVE' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Account is not active';
        END IF;

        IF p_kind = 'WITHDRAWAL' AND v_balance < p_amount THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Insufficient balance';
        END IF;

        IF p_kind = 'DEPOSIT'
           AND p_amount > 9999999999999.99 - v_balance THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Deposit exceeds supported balance';
        END IF;

        SET v_after = IF(
            p_kind = 'DEPOSIT',
            v_balance + p_amount,
            v_balance - p_amount
        );

        UPDATE account
        SET balance = v_after
        WHERE acc_no = p_acc;

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
            IF(p_kind = 'WITHDRAWAL', p_acc, NULL),
            IF(p_kind = 'DEPOSIT', p_acc, NULL),
            p_kind,
            'CASH',
            p_amount,
            p_emp,
            p_remarks
        );

        SET p_trans_id = LAST_INSERT_ID();

        UPDATE cash_operation_request
        SET
            trans_id = p_trans_id,
            balance_before = v_balance,
            balance_after = v_after
        WHERE emp_id = p_emp AND request_key = p_key;

        INSERT INTO audit_log (
            emp_id,
            action,
            table_name,
            record_id,
            old_value,
            new_value,
            details
        )
        VALUES (
            p_emp,
            IF(
                p_kind = 'DEPOSIT',
                'CASH_DEPOSIT',
                'CASH_WITHDRAWAL'
            ),
            'bank_transaction',
            CAST(p_trans_id AS CHAR),
            CAST(v_balance AS CHAR),
            CAST(v_after AS CHAR),
            CONCAT(
                'Account ', p_acc, '; ',
                COALESCE(p_remarks, '')
            )
        );
    END IF;

    COMMIT;
END$$

CREATE PROCEDURE sp_cash_deposit(
    IN p_emp INT,
    IN p_acc BIGINT UNSIGNED,
    IN p_amount DECIMAL(15,2),
    IN p_remarks VARCHAR(255),
    IN p_key CHAR(36),
    OUT p_trans_id BIGINT
)
BEGIN
    CALL sp_cash_operation(
        p_emp, p_acc, 'DEPOSIT',
        p_amount, p_remarks, p_key, p_trans_id
    );
END$$

CREATE PROCEDURE sp_cash_withdraw(
    IN p_emp INT,
    IN p_acc BIGINT UNSIGNED,
    IN p_amount DECIMAL(15,2),
    IN p_remarks VARCHAR(255),
    IN p_key CHAR(36),
    OUT p_trans_id BIGINT
)
BEGIN
    CALL sp_cash_operation(
        p_emp, p_acc, 'WITHDRAWAL',
        p_amount, p_remarks, p_key, p_trans_id
    );
END$$

DELIMITER ;