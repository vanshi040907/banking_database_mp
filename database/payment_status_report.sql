-- Run this SELECT in MySQL Workbench to see latest internal payment outcomes.
USE bank_db;
SELECT reference_no, from_acc_no, to_acc_no, amount, status,
       failure_reason, transaction_id,
       current_sender_balance, current_recipient_balance, created_at
FROM v_internal_payment_status
ORDER BY attempt_id DESC
LIMIT 50;
