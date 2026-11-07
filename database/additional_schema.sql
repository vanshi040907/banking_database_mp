--  these tables i have added after the creation of the primary schema that is schema.sql that i realized, we have missed while constructing the main schema

use bank_db;

--this is the table for storing the account no. linked pin hashes for the money transfers

CREATE TABLE account_transaction_pin (
    acc_no BIGINT UNSIGNED PRIMARY KEY,
    pin_hash VARCHAR(255) NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_transaction_pin_account
        FOREIGN KEY (acc_no)
        REFERENCES account(acc_no),

    CONSTRAINT chk_pin_attempts
        CHECK (failed_attempts >= 0)
) ENGINE=InnoDB;



