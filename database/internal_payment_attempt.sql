-- Run once on an existing bank_db; safe to rerun.
CREATE TABLE IF NOT EXISTS internal_payment_attempt (
    attempt_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    reference_no    CHAR(36) NOT NULL,
    customer_id     INT NOT NULL,
    from_acc_no     VARCHAR(20) NOT NULL,
    to_acc_no       VARCHAR(20) NOT NULL,
    amount          DECIMAL(15,2) NOT NULL,
    status          ENUM('DONE','FAILED') NOT NULL,
    failure_reason  VARCHAR(255) NULL,
    transaction_id  BIGINT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customer(cust_id),
    FOREIGN KEY (transaction_id) REFERENCES bank_transaction(trans_id),
    INDEX idx_payment_attempt_sender (from_acc_no, created_at),
    INDEX idx_payment_attempt_reference (reference_no),
    CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW v_internal_payment_status AS
SELECT p.attempt_id, p.reference_no, p.from_acc_no, p.to_acc_no,
       p.amount, p.status, p.failure_reason, p.transaction_id, p.created_at,
       sender.balance AS current_sender_balance,
       recipient.balance AS current_recipient_balance
FROM internal_payment_attempt p
LEFT JOIN account sender ON sender.acc_no = p.from_acc_no
LEFT JOIN account recipient ON recipient.acc_no = p.to_acc_no;

-- Include successful internal transfers made before this table existed.
INSERT INTO internal_payment_attempt
    (reference_no, customer_id, from_acc_no, to_acc_no, amount, status, transaction_id, created_at)
SELECT t.reference_no, a.cust_id, CAST(t.from_acc_no AS CHAR),
       CAST(t.to_acc_no AS CHAR), t.amount, 'DONE', t.trans_id, t.trans_date
FROM bank_transaction t
JOIN account a ON a.acc_no = t.from_acc_no
WHERE t.trans_mode = 'INTERNAL' AND t.trans_status = 'SUCCESS'
  AND NOT EXISTS (
      SELECT 1 FROM internal_payment_attempt p WHERE p.transaction_id = t.trans_id
  );
