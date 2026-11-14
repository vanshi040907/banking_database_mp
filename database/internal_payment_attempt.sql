-- Run once on an existing bank_db (safe to rerun). Records transfers that were rejected,
-- so the customer can see them next to their normal history. Balances are never touched.
CREATE TABLE IF NOT EXISTS failed_transfer_attempt (
    attempt_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    reference_no   CHAR(36) NOT NULL,
    customer_id    INT NOT NULL,
    from_acc_no    VARCHAR(20) NOT NULL,
    to_acc_no      VARCHAR(20) NOT NULL,
    amount         DECIMAL(15,2) NOT NULL,
    failure_reason VARCHAR(255) NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customer(cust_id),
    INDEX idx_failed_transfer_sender (from_acc_no, created_at)
) ENGINE=InnoDB;
