-- Additional triggers: no account status audit trigger because existing
-- sp_close_account and sp_set_account_status already write audit_log.
USE bank_db;
DROP TRIGGER IF EXISTS trg_employee_role_audit;
DROP TRIGGER IF EXISTS trg_customer_kyc_audit;
DROP TRIGGER IF EXISTS trg_prevent_account_delete;
DROP TRIGGER IF EXISTS trg_prevent_transaction_delete;
DROP TRIGGER IF EXISTS trg_protect_transaction_update;
DROP TRIGGER IF EXISTS trg_loan_payment_audit;
DELIMITER $$
CREATE TRIGGER trg_employee_role_audit
AFTER UPDATE ON employee FOR EACH ROW
BEGIN
 IF NOT (OLD.role_id <=> NEW.role_id) THEN
  INSERT INTO audit_log(emp_id,action,table_name,record_id,old_value,new_value,details)
  VALUES(NULL,'EMP_ROLE_CHANGE','employee',CAST(NEW.emp_id AS CHAR),CAST(OLD.role_id AS CHAR),CAST(NEW.role_id AS CHAR),
  'Role changed; initiating actor not recorded by this trigger');
 END IF;
END$$
CREATE TRIGGER trg_customer_kyc_audit
AFTER UPDATE ON customer FOR EACH ROW
BEGIN
 IF NOT (OLD.kyc_status <=> NEW.kyc_status) THEN
  INSERT INTO audit_log(emp_id,action,table_name,record_id,old_value,new_value,details)
  VALUES(NULL,'KYC_CHANGE','customer',CAST(NEW.cust_id AS CHAR),OLD.kyc_status,NEW.kyc_status,
  'KYC status changed; initiating actor not recorded by this trigger');
 END IF;
END$$
CREATE TRIGGER trg_prevent_account_delete
BEFORE DELETE ON account FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Do not DELETE bank accounts; close them instead';
END$$
CREATE TRIGGER trg_prevent_transaction_delete
BEFORE DELETE ON bank_transaction FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial transaction history cannot be deleted';
END$$
CREATE TRIGGER trg_protect_transaction_update
BEFORE UPDATE ON bank_transaction FOR EACH ROW
BEGIN
 IF OLD.trans_status='SUCCESS' AND
   (NOT (OLD.from_acc_no <=> NEW.from_acc_no)
    OR NOT (OLD.to_acc_no <=> NEW.to_acc_no)
    OR NOT (OLD.amount <=> NEW.amount)
    OR NOT (OLD.trans_type <=> NEW.trans_type)
    OR NOT (OLD.trans_mode <=> NEW.trans_mode)
    OR NOT (OLD.reference_no <=> NEW.reference_no)
    OR NOT (OLD.trans_status <=> NEW.trans_status)
    OR NOT (OLD.trans_date <=> NEW.trans_date)) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Successful transaction financial fields are immutable';
 END IF;
END$$
CREATE TRIGGER trg_loan_payment_audit
AFTER INSERT ON loan_payment FOR EACH ROW
BEGIN
 INSERT INTO audit_log(emp_id,action,table_name,record_id,new_value,details)
 VALUES(NULL,'LOAN_PAYMENT','loan_payment',CAST(NEW.pay_id AS CHAR),CAST(NEW.amount AS CHAR),
 CONCAT('Loan ',NEW.loan_id,', EMI ',COALESCE(CAST(NEW.emi_id AS CHAR),'none')));
END$$
DELIMITER ;
