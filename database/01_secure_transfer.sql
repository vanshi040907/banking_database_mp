DELIMITER $$

CREATE PROCEDURE sp_secure_transfer(
    IN p_cust INT,
    IN p_from BIGINT UNSIGNED,
    IN p_to BIGINT UNSIGNED,
    IN p_amount DECIMAL(15,2),
    IN p_remarks VARCHAR(255),
    IN p_key CHAR(36),
    OUT p_trans_id BIGINT
)
BEGIN
    DECLARE v_hash CHAR(64);
    DECLARE v_saved_hash CHAR(64);
    DECLARE v_saved_id BIGINT DEFAULT NULL;

    DECLARE v_from_status VARCHAR(10) DEFAULT NULL;
    DECLARE v_to_status VARCHAR(10) DEFAULT NULL;
    DECLARE v_owner INT DEFAULT NULL;
    DECLARE v_balance DECIMAL(15,2) DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- Validate transfer request
    IF p_cust IS NULL
       OR p_from IS NULL
       OR p_to IS NULL
       OR p_amount IS NULL
       OR p_amount <= 0
       OR p_key IS NULL
       OR CHAR_LENGTH(p_key) <> 36 THEN

        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid transfer request';
    END IF;

    IF p_from = p_to THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot transfer to the same account';
    END IF;

    -- Hash request details to detect changed retries
    SET v_hash = SHA2(
        JSON_ARRAY(
            CAST(p_from AS CHAR),
            CAST(p_to AS CHAR),
            CAST(p_amount AS CHAR),
            COALESCE(p_remarks, ''),
            'IMPS'
        ),
        256
    );

    START TRANSACTION;

    -- Register the idempotency key
    INSERT INTO transfer_idempotency (
        cust_id,
        request_key,
        request_hash
    )
    VALUES (
        p_cust,
        p_key,
        v_hash
    )
    ON DUPLICATE KEY UPDATE id = id;

    -- Lock the idempotency record
    SELECT request_hash, trans_id
    INTO v_saved_hash, v_saved_id
    FROM transfer_idempotency
    WHERE cust_id = p_cust
      AND request_key = p_key
    FOR UPDATE;

    -- Prevent reuse of a key with different details
    IF v_saved_hash <> v_hash THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT =
        'Idempotency key reused with different transfer details';
    END IF;

    -- Return existing transaction for a successful retry
    IF v_saved_id IS NOT NULL THEN

        SET p_trans_id = v_saved_id;

    ELSE

        -- Lock accounts in a consistent order
        IF p_from < p_to THEN

            SELECT status, cust_id, balance
            INTO v_from_status, v_owner, v_balance
            FROM account
            WHERE acc_no = p_from
            FOR UPDATE;

            SELECT status
            INTO v_to_status
            FROM account
            WHERE acc_no = p_to
            FOR UPDATE;

        ELSE

            SELECT status
            INTO v_to_status
            FROM account
            WHERE acc_no = p_to
            FOR UPDATE;

            SELECT status, cust_id, balance
            INTO v_from_status, v_owner, v_balance
            FROM account
            WHERE acc_no = p_from
            FOR UPDATE;

        END IF;

        -- Validate sender and receiver
        IF v_from_status IS NULL THEN

            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Sender account not found';

        ELSEIF v_owner <> p_cust THEN

            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
            'You can only send money from your own account';

        ELSEIF v_from_status <> 'ACTIVE' THEN

            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Your account is not active';

        ELSEIF v_to_status IS NULL THEN

            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Receiver account not found';

        ELSEIF v_to_status <> 'ACTIVE' THEN

            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
            'Receiver account cannot accept money right now';

        ELSEIF v_balance < p_amount THEN

            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Insufficient balance';

        END IF;

        -- Deduct money from sender
        UPDATE account
        SET balance = balance - p_amount
        WHERE acc_no = p_from;

        -- Credit money to receiver
        UPDATE account
        SET balance = balance + p_amount
        WHERE acc_no = p_to;

        -- Record transaction
        INSERT INTO bank_transaction (
            from_acc_no,
            to_acc_no,
            trans_type,
            trans_mode,
            amount,
            remarks
        )
        VALUES (
            p_from,
            p_to,
            'TRANSFER',
            'IMPS',
            p_amount,
            p_remarks
        );

        SET p_trans_id = LAST_INSERT_ID();

        -- Save transaction ID for future retries
        UPDATE transfer_idempotency
        SET trans_id = p_trans_id
        WHERE cust_id = p_cust
          AND request_key = p_key;

    END IF;

    COMMIT;

END$$

DELIMITER ;