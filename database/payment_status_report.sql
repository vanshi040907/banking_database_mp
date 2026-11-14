-- Read-only: recent transfers (successful and failed) with the people involved.
SELECT 'SUCCESS' AS outcome, t.reference_no, t.from_acc_no, s.name AS sender_name,
       t.to_acc_no, r.name AS recipient_name, t.amount, NULL AS failure_reason, t.trans_date AS at
FROM bank_transaction t
JOIN account sa ON sa.acc_no = t.from_acc_no JOIN customer s ON s.cust_id = sa.cust_id
JOIN account ra ON ra.acc_no = t.to_acc_no   JOIN customer r ON r.cust_id = ra.cust_id
WHERE t.trans_type = 'TRANSFER'
UNION ALL
SELECT 'FAILED', f.reference_no, f.from_acc_no, s.name, f.to_acc_no, r.name,
       f.amount, f.failure_reason, f.created_at
FROM failed_transfer_attempt f
JOIN customer s ON s.cust_id = f.customer_id
LEFT JOIN account ra ON ra.acc_no = f.to_acc_no LEFT JOIN customer r ON r.cust_id = ra.cust_id
ORDER BY at DESC LIMIT 50;
