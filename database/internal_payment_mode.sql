-- Apply once to an existing bank_db before enabling internal demo payments.
ALTER TABLE bank_transaction
  MODIFY trans_mode ENUM('CASH','UPI','NEFT','IMPS','CARD','CHEQUE','INTERNAL') NOT NULL;
