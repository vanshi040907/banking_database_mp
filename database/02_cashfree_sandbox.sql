-- Sandbox requests are separate from bank transactions and never change balances.
CREATE TABLE IF NOT EXISTS sandbox_phone_payout (
  transfer_id CHAR(32) PRIMARY KEY,
  cust_id INT NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sandbox_phone_payout_customer FOREIGN KEY (cust_id) REFERENCES customer(cust_id),
  INDEX idx_sandbox_phone_payout_customer (cust_id)
) ENGINE=InnoDB;
