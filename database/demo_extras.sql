-- =====================================================================
--  Bank DB : demo_extras.sql   (OPTIONAL, run AFTER seed.sql)
--  Adds cards, fixed deposits and a loan so the Cards / Deposits / Loans
--  screens have something to show. Safe to skip.
-- =====================================================================
USE bank_db;

INSERT INTO card (acc_no, approved_by, card_no, card_type, issue_date, expiry_date, status, pin_hash, daily_limit) VALUES
(1000000001, 2, 'XXXX-XXXX-XXXX-4821', 'DEBIT',  '2024-03-01', '2029-03-31', 'ACTIVE',  '$2b$10$dummyhash', 50000),
(1000000001, 2, 'XXXX-XXXX-XXXX-9034', 'CREDIT', '2025-01-15', '2030-01-31', 'ACTIVE',  '$2b$10$dummyhash', 100000),
(1000000004, 2, 'XXXX-XXXX-XXXX-1177', 'DEBIT',  '2025-06-10', '2030-06-30', 'ACTIVE',  '$2b$10$dummyhash', 40000),
(1000000002, 2, 'XXXX-XXXX-XXXX-6502', 'DEBIT',  '2023-02-01', '2026-02-28', 'EXPIRED', '$2b$10$dummyhash', 30000);

INSERT INTO fixed_deposit (cust_id, branch_ifsc, linked_acc_no, amount, int_rate_fd, duration_months, start_date, payout_type, status) VALUES
(1, 'IIT00000001', 1000000001, 100000, 7.10, 12, '2026-03-01', 'AT_MATURITY', 'ACTIVE'),
(1, 'IIT00000001', 1000000001,  50000, 6.80, 24, '2025-09-15', 'QUARTERLY',   'ACTIVE'),
(4, 'IIT00000001', 1000000004,  25000, 6.50,  6, '2026-06-01', 'AT_MATURITY', 'ACTIVE');

INSERT INTO fd_payout (fd_id, payout_kind, payout_date, amount) VALUES
(2, 'INTEREST', '2025-12-15',  850.00),
(2, 'INTEREST', '2026-03-15',  850.00),
(2, 'INTEREST', '2026-06-15',  850.00),
(2, 'INTEREST', '2026-09-15',  850.00);

-- A personal loan with a full EMI schedule (declining-balance)
INSERT INTO loan (cust_id, branch_ifsc, approved_by, disbursed_acc_no, loantype, principle_amt, int_rate,
                  tenure_months, start_date, outstanding_amount, status)
VALUES (1, 'IIT00000001', 1, 1000000001, 'PERSONAL', 200000, 11.50, 24, '2026-06-01', 200000, 'ACTIVE');
SET @loan = LAST_INSERT_ID();
SET @P = 200000, @r = 11.5/1200, @n = 24;
SET @emi = ROUND(@P*@r*POW(1+@r,@n)/(POW(1+@r,@n)-1), 2);

INSERT INTO loan_emi_schedule (loan_id, installment_no, due_date, emi_amount, principal_part, interest_part, status)
WITH RECURSIVE s (i, bal, intr, prin) AS (
    SELECT 1, CAST(@P AS DECIMAL(15,2)), CAST(ROUND(@P*@r,2) AS DECIMAL(15,2)),
              CAST(@emi - ROUND(@P*@r,2) AS DECIMAL(15,2))
    UNION ALL
    SELECT i+1, CAST(bal-prin AS DECIMAL(15,2)),
           CAST(ROUND((bal-prin)*@r,2) AS DECIMAL(15,2)),
           CAST(@emi - ROUND((bal-prin)*@r,2) AS DECIMAL(15,2))
    FROM s WHERE i < @n
)
SELECT @loan, i, DATE_ADD('2026-07-05', INTERVAL i-1 MONTH), @emi, prin, intr,
       IF(DATE_ADD('2026-07-05', INTERVAL i-1 MONTH) < CURRENT_DATE, 'PAID', 'PENDING')
FROM s;

UPDATE loan SET outstanding_amount =
    principle_amt - COALESCE((SELECT SUM(principal_part) FROM loan_emi_schedule
                              WHERE loan_id = @loan AND status = 'PAID'), 0)
WHERE loan_id = @loan;
