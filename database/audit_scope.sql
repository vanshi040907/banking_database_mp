USE bank_db;

CREATE TABLE IF NOT EXISTS audit_log_branch (
    log_id BIGINT NOT NULL,
    branch_ifsc CHAR(11) NOT NULL,

    PRIMARY KEY (log_id, branch_ifsc),
    INDEX idx_audit_branch (branch_ifsc, log_id),

    FOREIGN KEY (log_id) REFERENCES audit_log(log_id),
    FOREIGN KEY (branch_ifsc) REFERENCES branch(ifsc_code)
) ENGINE=InnoDB;

DROP TRIGGER IF EXISTS trg_audit_capture_scope;
DROP PROCEDURE IF EXISTS sp_capture_audit_scope;

DELIMITER $$

CREATE PROCEDURE sp_capture_audit_scope(
    IN p_log BIGINT,
    IN p_table VARCHAR(40),
    IN p_record VARCHAR(40),
    IN p_action VARCHAR(40),
    IN p_old VARCHAR(255),
    IN p_new VARCHAR(255)
)
BEGIN
    DECLARE v_id DECIMAL(20,0);

    IF p_table = 'branch' THEN
        INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
        SELECT p_log, ifsc_code
        FROM branch
        WHERE ifsc_code = p_record;

    ELSEIF p_record REGEXP '^[1-9][0-9]{0,19}$' THEN
        SET v_id = CAST(p_record AS DECIMAL(20,0));

        IF v_id <= 18446744073709551615 THEN

            IF p_table = 'account' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, branch_ifsc
                FROM account
                WHERE acc_no = v_id;

            ELSEIF p_table = 'bank_transaction' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT DISTINCT p_log, a.branch_ifsc
                FROM bank_transaction t
                JOIN account a
                  ON a.acc_no = t.from_acc_no
                  OR a.acc_no = t.to_acc_no
                WHERE t.trans_id = v_id;

            ELSEIF p_table = 'card' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, a.branch_ifsc
                FROM card c
                JOIN account a ON a.acc_no = c.acc_no
                WHERE c.card_id = v_id;

            ELSEIF p_table = 'card_unblock_request' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, a.branch_ifsc
                FROM card_unblock_request r
                JOIN card c ON c.card_id = r.card_id
                JOIN account a ON a.acc_no = c.acc_no
                WHERE r.request_id = v_id;

            ELSEIF p_table = 'customer' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, registered_branch_ifsc
                FROM customer
                WHERE cust_id = v_id
                  AND registered_branch_ifsc IS NOT NULL;

                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT DISTINCT p_log, branch_ifsc
                FROM account
                WHERE cust_id = v_id;

            ELSEIF p_table = 'employee' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, branch_ifsc
                FROM employee
                WHERE emp_id = v_id;

                -- Only these server-generated payloads contain
                -- trusted branch fields.
                IF p_action IN (
                    'EMPLOYEE_CREATE',
                    'EMPLOYEE_ACCESS_UPDATE'
                ) THEN
                    IF JSON_VALID(p_old) THEN
                        INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                        SELECT p_log, ifsc_code
                        FROM branch
                        WHERE ifsc_code = JSON_UNQUOTE(
                            JSON_EXTRACT(p_old, '$.branchIfsc')
                        );
                    END IF;

                    IF JSON_VALID(p_new) THEN
                        INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                        SELECT p_log, ifsc_code
                        FROM branch
                        WHERE ifsc_code = JSON_UNQUOTE(
                            JSON_EXTRACT(p_new, '$.branchIfsc')
                        );
                    END IF;
                END IF;

            ELSEIF p_table = 'fixed_deposit' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, branch_ifsc
                FROM fixed_deposit
                WHERE fd_id = v_id;

            ELSEIF p_table = 'fd_payout' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, f.branch_ifsc
                FROM fd_payout p
                JOIN fixed_deposit f ON f.fd_id = p.fd_id
                WHERE p.payout_id = v_id;

            ELSEIF p_table = 'loan' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, branch_ifsc
                FROM loan
                WHERE loan_id = v_id;

            ELSEIF p_table = 'loan_emi_schedule' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, l.branch_ifsc
                FROM loan_emi_schedule e
                JOIN loan l ON l.loan_id = e.loan_id
                WHERE e.emi_id = v_id;

            ELSEIF p_table = 'loan_payment' THEN
                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT p_log, l.branch_ifsc
                FROM loan_payment p
                JOIN loan l ON l.loan_id = p.loan_id
                WHERE p.pay_id = v_id;

                INSERT IGNORE INTO audit_log_branch(log_id, branch_ifsc)
                SELECT DISTINCT p_log, a.branch_ifsc
                FROM loan_payment p
                JOIN bank_transaction t ON t.trans_id = p.trans_id
                JOIN account a
                  ON a.acc_no = t.from_acc_no
                  OR a.acc_no = t.to_acc_no
                WHERE p.pay_id = v_id;
            END IF;
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_audit_capture_scope
AFTER INSERT ON audit_log FOR EACH ROW
BEGIN
    CALL sp_capture_audit_scope(
        NEW.log_id,
        NEW.table_name,
        NEW.record_id,
        NEW.action,
        NEW.old_value,
        NEW.new_value
    );
END$$

DROP TRIGGER IF EXISTS trg_audit_no_update$$

CREATE TRIGGER trg_audit_no_update
BEFORE UPDATE ON audit_log FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Audit entries cannot be updated';
END$$

DROP TRIGGER IF EXISTS trg_audit_no_delete$$

CREATE TRIGGER trg_audit_no_delete
BEFORE DELETE ON audit_log FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Audit entries cannot be deleted';
END$$

DROP TRIGGER IF EXISTS trg_audit_scope_no_update$$

CREATE TRIGGER trg_audit_scope_no_update
BEFORE UPDATE ON audit_log_branch FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Audit branch snapshots cannot be updated';
END$$

DROP TRIGGER IF EXISTS trg_audit_scope_no_delete$$

CREATE TRIGGER trg_audit_scope_no_delete
BEFORE DELETE ON audit_log_branch FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Audit branch snapshots cannot be deleted';
END$$

DELIMITER ;