USE bank_db;

ALTER TABLE customer
    ADD COLUMN registered_branch_ifsc CHAR(11) NULL,
    ADD INDEX idx_customer_registration_branch (
        registered_branch_ifsc
    ),
    ADD CONSTRAINT fk_customer_registration_branch
        FOREIGN KEY (registered_branch_ifsc)
        REFERENCES branch(ifsc_code);

-- Infer a registration branch only when all existing accounts
-- for that customer belong to the same branch.
UPDATE customer c
JOIN (
    SELECT
        cust_id,
        MIN(branch_ifsc) AS inferred_branch
    FROM account
    GROUP BY cust_id
    HAVING COUNT(DISTINCT branch_ifsc) = 1
) inferred ON inferred.cust_id = c.cust_id
SET c.registered_branch_ifsc = inferred.inferred_branch
WHERE c.registered_branch_ifsc IS NULL;

-- These customers require explicit branch assignment.
-- Do not guess where they belong.
SELECT cust_id, name
FROM customer
WHERE registered_branch_ifsc IS NULL;