-- Used by sp_secure_transfer to make a retried transfer safe. Run once (safe to rerun).
CREATE TABLE IF NOT EXISTS transfer_idempotency (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cust_id      INT      NOT NULL,
    request_key  CHAR(36) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    trans_id     BIGINT   NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customer_request (cust_id, request_key),
    INDEX fk_transfer_idem_transaction (trans_id),
    CONSTRAINT fk_transfer_idem_customer    FOREIGN KEY (cust_id)  REFERENCES customer(cust_id),
    CONSTRAINT fk_transfer_idem_transaction FOREIGN KEY (trans_id) REFERENCES bank_transaction(trans_id)
) ENGINE=InnoDB;
