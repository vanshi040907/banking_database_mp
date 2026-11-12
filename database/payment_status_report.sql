-- Run this SELECT in MySQL Workbench to see people and payment outcomes.
USE bank_db;
SELECT p.transaction_id, p.reference_no,
       sender.name AS sender_name, p.from_acc_no AS sender_account,
       recipient.name AS recipient_name, p.to_acc_no AS recipient_account,
       p.amount, p.status, p.failure_reason,
       p.current_sender_balance, p.current_recipient_balance, p.created_at
FROM v_internal_payment_status p
LEFT JOIN account sender_account ON sender_account.acc_no = p.from_acc_no
LEFT JOIN customer sender ON sender.cust_id = sender_account.cust_id
LEFT JOIN account recipient_account ON recipient_account.acc_no = p.to_acc_no
LEFT JOIN customer recipient ON recipient.cust_id = recipient_account.cust_id
ORDER BY p.created_at DESC, p.attempt_id DESC
LIMIT 50;
