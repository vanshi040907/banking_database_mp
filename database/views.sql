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

-- Account overview WITHOUT personal information (no names, phones, addresses).
-- Roles that lack VIEW_PERSONAL_INFO (e.g. Analyst) are served from this view.
CREATE OR REPLACE VIEW v_account_overview AS
SELECT a.acc_no, a.branch_ifsc, b.branch_name, t.type_name, a.balance,
       a.status, a.is_primary, a.creation_date, a.closed_date
FROM account a
JOIN branch       b ON b.ifsc_code = a.branch_ifsc
JOIN account_type t ON t.type_id   = a.type_id;