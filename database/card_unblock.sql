USE bank_db;

CREATE TABLE IF NOT EXISTS card_unblock_request (
    request_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    card_id INT NOT NULL,
    cust_id INT NOT NULL,
    reason VARCHAR(255) NOT NULL,

    status ENUM('PENDING', 'APPROVED', 'REJECTED')
        NOT NULL DEFAULT 'PENDING',

    reviewed_by INT NULL,
    review_note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,

    -- Only one pending request per card.
    -- Reviewed requests produce NULL, allowing historical requests.
    pending_card_id INT GENERATED ALWAYS AS (
        CASE WHEN status = 'PENDING' THEN card_id ELSE NULL END
    ) STORED,

    UNIQUE KEY uq_pending_card_unblock (pending_card_id),
    INDEX idx_unblock_customer (cust_id, card_id, request_id),
    INDEX idx_unblock_status (status, request_id),

    FOREIGN KEY (card_id) REFERENCES card(card_id),
    FOREIGN KEY (cust_id) REFERENCES customer(cust_id),
    FOREIGN KEY (reviewed_by) REFERENCES employee(emp_id),

    CHECK (CHAR_LENGTH(TRIM(reason)) >= 5),

    CHECK (
        (
            status = 'PENDING'
            AND reviewed_by IS NULL
            AND reviewed_at IS NULL
        )
        OR
        (
            status IN ('APPROVED', 'REJECTED')
            AND reviewed_by IS NOT NULL
            AND reviewed_at IS NOT NULL
        )
    )
) ENGINE=InnoDB;

INSERT INTO permission (perm_code, description)
VALUES ('UNBLOCK_CARD', 'Review customer card unblock requests')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT IGNORE INTO role_permission (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM role r
CROSS JOIN permission p
WHERE r.role_name IN ('ACCOUNT_OFFICER', 'MANAGER', 'ADMIN')
  AND p.perm_code = 'UNBLOCK_CARD';