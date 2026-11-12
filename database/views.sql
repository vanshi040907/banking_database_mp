-- =====================================================================
--  Bank DB : views.sql   (run AFTER schema.sql)
--  A view is a saved SELECT. Derived data lives here instead of in
--  columns, so it can never go out of date.
-- =====================================================================
USE bank_db;

-- Total deposits per branch (replaces the old branch.deposits column)
CREATE OR REPLACE VIEW v_branch_deposits AS
SELECT b.ifsc_code, b.branch_name,
       COUNT(a.acc_no)              AS total_accounts,
       COALESCE(SUM(a.balance), 0)  AS branch_deposits
FROM branch b
LEFT JOIN account a ON a.branch_ifsc = b.ifsc_code AND a.status <> 'CLOSED'
GROUP BY b.ifsc_code, b.branch_name;

-- One row per (account, transaction): every transaction an account took part in,
-- seen from THAT account's side. Used for the history tab, recent/frequent payees
-- and the weekly/monthly/yearly savings calculation.
CREATE OR REPLACE VIEW v_transaction_history AS
SELECT t.trans_id, t.reference_no, t.trans_date, t.trans_type, t.trans_mode,
       t.amount, t.trans_status, t.remarks,
       t.from_acc_no AS acc_no,
       'DEBIT'       AS direction,
       t.to_acc_no   AS counterparty_acc_no
FROM bank_transaction t
WHERE t.from_acc_no IS NOT NULL
UNION ALL
SELECT t.trans_id, t.reference_no, t.trans_date, t.trans_type, t.trans_mode,
       t.amount, t.trans_status, t.remarks,
       t.to_acc_no   AS acc_no,
       'CREDIT'      AS direction,
       t.from_acc_no AS counterparty_acc_no
FROM bank_transaction t
WHERE t.to_acc_no IS NOT NULL;

-- Current balances alongside the outcome of each internal payment attempt.
CREATE OR REPLACE VIEW v_internal_payment_status AS
SELECT p.attempt_id, p.reference_no, p.from_acc_no, p.to_acc_no,
       p.amount, p.status, p.failure_reason, p.transaction_id, p.created_at,
       sender.balance AS current_sender_balance,
       recipient.balance AS current_recipient_balance
FROM internal_payment_attempt p
LEFT JOIN account sender ON sender.acc_no = p.from_acc_no
LEFT JOIN account recipient ON recipient.acc_no = p.to_acc_no;

-- Account overview WITHOUT personal information (no names, phones, addresses).
-- Roles that lack VIEW_PERSONAL_INFO (e.g. Analyst) are served from this view.
CREATE OR REPLACE VIEW v_account_overview AS
SELECT a.acc_no, a.branch_ifsc, b.branch_name, t.type_name, a.balance,
       a.status, a.is_primary, a.creation_date, a.closed_date
FROM account a
JOIN branch       b ON b.ifsc_code = a.branch_ifsc
JOIN account_type t ON t.type_id   = a.type_id;

CREATE OR REPLACE VIEW v_customer_account_summary AS
SELECT a.cust_id,a.acc_no,a.branch_ifsc,b.branch_name,t.type_name,
       a.balance,a.status,a.is_primary,a.creation_date
FROM account a JOIN branch b ON b.ifsc_code=a.branch_ifsc
JOIN account_type t ON t.type_id=a.type_id;

CREATE OR REPLACE VIEW v_fd_overview AS
SELECT f.fd_id,f.cust_id,f.linked_acc_no,f.branch_ifsc,f.amount AS principal,
 f.int_rate_fd,f.duration_months,f.start_date,
 DATE_ADD(f.start_date,INTERVAL f.duration_months MONTH) AS maturity_date,
 ROUND(f.amount*f.int_rate_fd*f.duration_months/1200,2) AS estimated_simple_interest,
 f.status,f.payout_type
FROM fixed_deposit f;

CREATE OR REPLACE VIEW v_loan_overview AS
SELECT l.loan_id,l.cust_id,l.branch_ifsc,l.loantype,l.principle_amt AS principal,
 l.int_rate,l.tenure_months,l.outstanding_amount,l.status,l.approved_by,
 COUNT(e.emi_id) AS scheduled_emis,
 COALESCE(SUM(CASE WHEN e.status='PAID' THEN 1 ELSE 0 END),0) AS paid_emis,
 COALESCE(SUM(CASE WHEN e.status IN ('PENDING','OVERDUE') THEN e.emi_amount ELSE 0 END),0) AS remaining_scheduled_emis
FROM loan l LEFT JOIN loan_emi_schedule e ON e.loan_id=l.loan_id
GROUP BY l.loan_id,l.cust_id,l.branch_ifsc,l.loantype,l.principle_amt,
 l.int_rate,l.tenure_months,l.outstanding_amount,l.status,l.approved_by;

CREATE OR REPLACE VIEW v_branch_monthly_activity AS
SELECT a.branch_ifsc,DATE_FORMAT(t.trans_date,'%Y-%m') AS activity_month,
 COUNT(*) AS ledger_entries,
 SUM(CASE WHEN t.to_acc_no=a.acc_no THEN t.amount ELSE 0 END) AS incoming_amount,
 SUM(CASE WHEN t.from_acc_no=a.acc_no THEN t.amount ELSE 0 END) AS outgoing_amount
FROM bank_transaction t
JOIN account a ON a.acc_no=t.from_acc_no OR a.acc_no=t.to_acc_no
WHERE t.trans_status='SUCCESS'
GROUP BY a.branch_ifsc,DATE_FORMAT(t.trans_date,'%Y-%m');
-- Note: intra-branch transfers count once incoming and once outgoing; not net bank revenue.

CREATE OR REPLACE VIEW v_cashier_daily_activity AS
SELECT t.initiated_by AS emp_id,DATE(t.trans_date) AS activity_date,
 COUNT(*) AS cash_transactions,
 SUM(CASE WHEN t.trans_type='DEPOSIT' THEN t.amount ELSE 0 END) AS total_cash_deposits,
 SUM(CASE WHEN t.trans_type='WITHDRAWAL' THEN t.amount ELSE 0 END) AS total_cash_withdrawals
FROM bank_transaction t
WHERE t.trans_mode='CASH' AND t.trans_status='SUCCESS' AND t.initiated_by IS NOT NULL
GROUP BY t.initiated_by,DATE(t.trans_date);
