-- =====================================================================
--  Bank DB : schema.sql   (MySQL 8.0.16+, InnoDB)
--  Creates the database and all 24 tables. Safe to re-run: it DROPS
--  and recreates bank_db every time (so never run it on real data).
-- =====================================================================

DROP DATABASE IF EXISTS bank_db;
CREATE DATABASE bank_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE bank_db;

-- ---------------------------------------------------------------------
-- A. LOCATION AND BRANCH
-- ---------------------------------------------------------------------
CREATE TABLE location (
    pincode  CHAR(6)     PRIMARY KEY,
    city     VARCHAR(60) NOT NULL,
    state    VARCHAR(60) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE branch (
    ifsc_code           CHAR(11)     PRIMARY KEY,
    branch_name         VARCHAR(100) NOT NULL,
    address_line        VARCHAR(255) NOT NULL,
    pincode             CHAR(6)      NOT NULL,
    establishment_date  DATE         NOT NULL,
    manager_id          INT          NULL,      -- FK to employee is added below
    status              ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
    FOREIGN KEY (pincode) REFERENCES location(pincode)
    -- NOTE: no "deposits" column. Total deposits = SUM(account.balance),
    -- calculated in a view so it can never go stale.
) ENGINE=InnoDB;

CREATE TABLE branch_phone (
    ifsc_code  CHAR(11)    NOT NULL,
    phone_no   VARCHAR(15) NOT NULL,
    PRIMARY KEY (ifsc_code, phone_no),
    FOREIGN KEY (ifsc_code) REFERENCES branch(ifsc_code) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- B. STAFF AND ACCESS  (role / permission / role_permission)
-- ---------------------------------------------------------------------
CREATE TABLE role (
    role_id      INT AUTO_INCREMENT PRIMARY KEY,
    role_name    VARCHAR(30)  NOT NULL UNIQUE,      -- TELLER, MANAGER, ADMIN
    description  VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE permission (
    perm_id      INT AUTO_INCREMENT PRIMARY KEY,
    perm_code    VARCHAR(40)  NOT NULL UNIQUE,      -- FREEZE_ACCOUNT, ADJUST_BALANCE ...
    description  VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE role_permission (
    role_id  INT NOT NULL,
    perm_id  INT NOT NULL,
    PRIMARY KEY (role_id, perm_id),
    FOREIGN KEY (role_id) REFERENCES role(role_id)       ON DELETE CASCADE,
    FOREIGN KEY (perm_id) REFERENCES permission(perm_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE employee (
    emp_id         INT AUTO_INCREMENT PRIMARY KEY,
    branch_ifsc    CHAR(11)      NOT NULL,
    role_id        INT           NOT NULL,
    emp_name       VARCHAR(100)  NOT NULL,
    gender         ENUM('M','F','O') NOT NULL,
    dob            DATE          NOT NULL,
    designation    VARCHAR(50)   NOT NULL,          -- job title, e.g. "Senior Teller"
    salary         DECIMAL(12,2) NOT NULL CHECK (salary >= 0),
    join_date      DATE          NOT NULL,
    status         ENUM('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    password_hash  VARCHAR(100)  NOT NULL,          -- bcrypt hash, never the password
    last_login     DATETIME      NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,   -- temp password given at creation
    FOREIGN KEY (branch_ifsc) REFERENCES branch(ifsc_code),
    FOREIGN KEY (role_id)     REFERENCES role(role_id)
) ENGINE=InnoDB;

-- circular reference: branch needs employee, employee needs branch
ALTER TABLE branch
    ADD CONSTRAINT fk_branch_manager FOREIGN KEY (manager_id) REFERENCES employee(emp_id);

CREATE TABLE employee_phone (
    emp_id    INT         NOT NULL,
    phone_no  VARCHAR(15) NOT NULL UNIQUE,
    PRIMARY KEY (emp_id, phone_no),
    FOREIGN KEY (emp_id) REFERENCES employee(emp_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE employee_email (
    emp_id  INT          NOT NULL,
    mail    VARCHAR(120) NOT NULL UNIQUE,
    PRIMARY KEY (emp_id, mail),
    FOREIGN KEY (emp_id) REFERENCES employee(emp_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- C. CUSTOMERS
-- ---------------------------------------------------------------------
CREATE TABLE customer (
    cust_id         INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    dob             DATE         NOT NULL,
    gender          ENUM('M','F','O') NOT NULL,
    address_line    VARCHAR(255) NOT NULL,
    pincode         CHAR(6)      NOT NULL,
    id_proof_type   ENUM('AADHAAR','PASSPORT','VOTER_ID','DRIVING_LICENSE') NOT NULL,
    id_proof_no     VARCHAR(30)  NOT NULL,
    pan_no          CHAR(10)     NULL UNIQUE,
    kyc_status      ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
    status          ENUM('ACTIVE','INACTIVE','BLOCKED')   NOT NULL DEFAULT 'ACTIVE',
    password_hash   VARCHAR(100) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,   -- temp password given at registration
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pincode) REFERENCES location(pincode),
    UNIQUE (id_proof_type, id_proof_no)
) ENGINE=InnoDB;

CREATE TABLE customer_phone (
    cust_id     INT         NOT NULL,
    ph_no       VARCHAR(15) NOT NULL UNIQUE,
    is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,   -- the number that receives OTPs
    PRIMARY KEY (cust_id, ph_no),
    FOREIGN KEY (cust_id) REFERENCES customer(cust_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE customer_email (
    cust_id     INT          NOT NULL,
    mail        VARCHAR(120) NOT NULL UNIQUE,
    is_primary  BOOLEAN      NOT NULL DEFAULT FALSE,
    PRIMARY KEY (cust_id, mail),
    FOREIGN KEY (cust_id) REFERENCES customer(cust_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- D. ACCOUNTS AND CARDS
-- ---------------------------------------------------------------------
CREATE TABLE account_type (
    type_id          INT AUTO_INCREMENT PRIMARY KEY,
    type_name        VARCHAR(30)   NOT NULL UNIQUE,
    min_balance      DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (min_balance >= 0),
    interest_rate    DECIMAL(5,2)  NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
    daily_txn_limit  DECIMAL(15,2) NOT NULL CHECK (daily_txn_limit > 0)
) ENGINE=InnoDB;

CREATE TABLE account (
    acc_no         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cust_id        INT           NOT NULL,
    branch_ifsc    CHAR(11)      NOT NULL,
    type_id        INT           NOT NULL,
    opened_by      INT           NULL,
    balance        DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    creation_date  DATE          NOT NULL DEFAULT (CURRENT_DATE),
    validity       DATE          NULL,
    closed_date    DATE          NULL,
    is_primary     BOOLEAN       NOT NULL DEFAULT FALSE,  -- receives money sent to the owner's mobile number
    status         ENUM('ACTIVE','FROZEN','CLOSED') NOT NULL DEFAULT 'ACTIVE',
    FOREIGN KEY (cust_id)     REFERENCES customer(cust_id),
    FOREIGN KEY (branch_ifsc) REFERENCES branch(ifsc_code),
    FOREIGN KEY (type_id)     REFERENCES account_type(type_id),
    FOREIGN KEY (opened_by)   REFERENCES employee(emp_id),
    INDEX idx_account_cust (cust_id),
    INDEX idx_account_branch (branch_ifsc)
) ENGINE=InnoDB AUTO_INCREMENT=1000000001;

CREATE TABLE card (
    card_id        INT AUTO_INCREMENT PRIMARY KEY,
    acc_no         BIGINT UNSIGNED NOT NULL,
    approved_by    INT             NOT NULL,
    card_no        VARCHAR(19)     NOT NULL UNIQUE,    -- store masked or tokenized only
    card_type      ENUM('DEBIT','CREDIT') NOT NULL,
    issue_date     DATE            NOT NULL,
    expiry_date    DATE            NOT NULL,
    status         ENUM('ACTIVE','BLOCKED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    pin_hash       VARCHAR(100)    NOT NULL,
    pin_attempts   TINYINT         NOT NULL DEFAULT 0,
    daily_limit    DECIMAL(12,2)   NOT NULL DEFAULT 50000 CHECK (daily_limit > 0),
    FOREIGN KEY (acc_no)      REFERENCES account(acc_no),
    FOREIGN KEY (approved_by) REFERENCES employee(emp_id),
    CHECK (expiry_date > issue_date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- E. TRANSACTIONS
-- ---------------------------------------------------------------------
CREATE TABLE bank_transaction (
    trans_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    reference_no  CHAR(36)      NOT NULL UNIQUE DEFAULT (UUID()),
    from_acc_no   BIGINT UNSIGNED NULL,          -- NULL for a deposit
    to_acc_no     BIGINT UNSIGNED NULL,          -- NULL for a withdrawal
    card_id       INT           NULL,
    trans_type    ENUM('DEPOSIT','WITHDRAWAL','TRANSFER') NOT NULL,
    trans_mode    ENUM('CASH','UPI','NEFT','IMPS','CARD','CHEQUE','INTERNAL') NOT NULL,
    amount        DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    trans_date    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trans_status  ENUM('SUCCESS','FAILED','PENDING') NOT NULL DEFAULT 'SUCCESS',
    initiated_by  INT           NULL,          -- employee for cash deposit/withdrawal, NULL for customer transfers
    remarks       VARCHAR(255)  NULL,
    FOREIGN KEY (from_acc_no) REFERENCES account(acc_no),
    FOREIGN KEY (to_acc_no)   REFERENCES account(acc_no),
    FOREIGN KEY (card_id)     REFERENCES card(card_id),
    FOREIGN KEY (initiated_by) REFERENCES employee(emp_id),
    CONSTRAINT chk_trans_shape CHECK (
        (trans_type = 'DEPOSIT'    AND from_acc_no IS NULL     AND to_acc_no IS NOT NULL) OR
        (trans_type = 'WITHDRAWAL' AND from_acc_no IS NOT NULL AND to_acc_no IS NULL)     OR
        (trans_type = 'TRANSFER'   AND from_acc_no IS NOT NULL AND to_acc_no IS NOT NULL
                                   AND from_acc_no <> to_acc_no)
    ),
    INDEX idx_trans_date (trans_date),
    INDEX idx_trans_from (from_acc_no, trans_date),
    INDEX idx_trans_to   (to_acc_no, trans_date)
) ENGINE=InnoDB;

-- One row per internal payment attempt. Failed attempts never change balances.
CREATE TABLE internal_payment_attempt (
    attempt_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    reference_no    CHAR(36) NOT NULL,
    customer_id     INT NOT NULL,
    from_acc_no     VARCHAR(20) NOT NULL,
    to_acc_no       VARCHAR(20) NOT NULL,
    amount          DECIMAL(15,2) NOT NULL,
    status          ENUM('DONE','FAILED') NOT NULL,
    failure_reason  VARCHAR(255) NULL,
    transaction_id  BIGINT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customer(cust_id),
    FOREIGN KEY (transaction_id) REFERENCES bank_transaction(trans_id),
    INDEX idx_payment_attempt_sender (from_acc_no, created_at),
    INDEX idx_payment_attempt_reference (reference_no),
    CHECK (amount > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- F. FIXED DEPOSITS
-- ---------------------------------------------------------------------
CREATE TABLE fixed_deposit (
    fd_id            INT AUTO_INCREMENT PRIMARY KEY,
    cust_id          INT           NOT NULL,
    branch_ifsc      CHAR(11)      NOT NULL,
    linked_acc_no    BIGINT UNSIGNED NOT NULL,       -- where payouts are credited
    amount           DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    int_rate_fd      DECIMAL(5,2)  NOT NULL CHECK (int_rate_fd > 0),
    duration_months  INT           NOT NULL CHECK (duration_months > 0),
    start_date       DATE          NOT NULL,
    payout_type      ENUM('MONTHLY','QUARTERLY','AT_MATURITY') NOT NULL DEFAULT 'AT_MATURITY',
    status           ENUM('ACTIVE','MATURED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
    FOREIGN KEY (cust_id)       REFERENCES customer(cust_id),
    FOREIGN KEY (branch_ifsc)   REFERENCES branch(ifsc_code),
    FOREIGN KEY (linked_acc_no) REFERENCES account(acc_no)
) ENGINE=InnoDB;

CREATE TABLE fd_payout (
    payout_id          INT AUTO_INCREMENT PRIMARY KEY,
    fd_id              INT NOT NULL,
    payout_kind        ENUM('INTEREST','MATURITY','PREMATURE_CLOSURE') NOT NULL,
    payout_date        DATE NOT NULL,
    amount             DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    credited_trans_id  BIGINT NULL,
    FOREIGN KEY (fd_id)             REFERENCES fixed_deposit(fd_id),
    FOREIGN KEY (credited_trans_id) REFERENCES bank_transaction(trans_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- G. LOANS
-- ---------------------------------------------------------------------
CREATE TABLE loan (
    loan_id            INT AUTO_INCREMENT PRIMARY KEY,
    cust_id            INT           NOT NULL,
    branch_ifsc        CHAR(11)      NOT NULL,
    approved_by        INT           NULL,
    disbursed_acc_no   BIGINT UNSIGNED NULL,
    loantype           ENUM('HOME','AUTO','PERSONAL','EDUCATION','BUSINESS') NOT NULL,
    principle_amt      DECIMAL(15,2) NOT NULL CHECK (principle_amt > 0),
    int_rate           DECIMAL(5,2)  NOT NULL CHECK (int_rate > 0),   -- rate frozen at booking
    tenure_months      INT           NOT NULL CHECK (tenure_months > 0),
    start_date         DATE          NOT NULL,
    outstanding_amount DECIMAL(15,2) NOT NULL CHECK (outstanding_amount >= 0),
    status             ENUM('PENDING','ACTIVE','CLOSED','DEFAULTED') NOT NULL DEFAULT 'PENDING',
    FOREIGN KEY (cust_id)          REFERENCES customer(cust_id),
    FOREIGN KEY (branch_ifsc)      REFERENCES branch(ifsc_code),
    FOREIGN KEY (approved_by)      REFERENCES employee(emp_id),
    FOREIGN KEY (disbursed_acc_no) REFERENCES account(acc_no),
    INDEX idx_loan_cust (cust_id)
) ENGINE=InnoDB;

CREATE TABLE loan_emi_schedule (
    emi_id          INT AUTO_INCREMENT PRIMARY KEY,
    loan_id         INT           NOT NULL,
    installment_no  INT           NOT NULL,
    due_date        DATE          NOT NULL,
    emi_amount      DECIMAL(15,2) NOT NULL CHECK (emi_amount > 0),
    principal_part  DECIMAL(15,2) NOT NULL CHECK (principal_part >= 0),
    interest_part   DECIMAL(15,2) NOT NULL CHECK (interest_part >= 0),
    status          ENUM('PENDING','PAID','OVERDUE') NOT NULL DEFAULT 'PENDING',
    FOREIGN KEY (loan_id) REFERENCES loan(loan_id) ON DELETE CASCADE,
    UNIQUE (loan_id, installment_no),
    INDEX idx_emi_due (due_date, status)
) ENGINE=InnoDB;

CREATE TABLE loan_payment (
    pay_id    INT AUTO_INCREMENT PRIMARY KEY,
    loan_id   INT           NOT NULL,
    emi_id    INT           NULL,
    trans_id  BIGINT        NULL,
    amount    DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    pay_date  DATE          NOT NULL DEFAULT (CURRENT_DATE),
    pay_mode  ENUM('CASH','UPI','NEFT','IMPS','CARD','CHEQUE','ACCOUNT_DEBIT') NOT NULL,
    FOREIGN KEY (loan_id)  REFERENCES loan(loan_id) ON DELETE CASCADE,
    FOREIGN KEY (emi_id)   REFERENCES loan_emi_schedule(emi_id),
    FOREIGN KEY (trans_id) REFERENCES bank_transaction(trans_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- H. SECURITY AND AUDIT
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    log_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    emp_id      INT          NULL,                  -- NULL = done by the system
    action      VARCHAR(40)  NOT NULL,              -- ACCOUNT_OPEN, FREEZE, BALANCE_ADJUST ...
    table_name  VARCHAR(40)  NOT NULL,
    record_id   VARCHAR(40)  NOT NULL,
    old_value   VARCHAR(255) NULL,
    new_value   VARCHAR(255) NULL,
    details     VARCHAR(500) NULL,                  -- manager's justification etc.
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES employee(emp_id),
    INDEX idx_audit_time (created_at)
) ENGINE=InnoDB;

CREATE TABLE otp_verification (
    otp_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    cust_id     INT      NULL,
    emp_id      INT      NULL,
    purpose     ENUM('LOGIN','TRANSFER','PROFILE_UPDATE') NOT NULL DEFAULT 'LOGIN',
    otp_hash    VARCHAR(100) NOT NULL,               -- bcrypt hash of the OTP
    expires_at  DATETIME NOT NULL,
    attempts    TINYINT  NOT NULL DEFAULT 0,
    used        BOOLEAN  NOT NULL DEFAULT FALSE,
    FOREIGN KEY (cust_id) REFERENCES customer(cust_id) ON DELETE CASCADE,
    FOREIGN KEY (emp_id)  REFERENCES employee(emp_id)  ON DELETE CASCADE,
    -- exactly one of cust_id / emp_id must be filled
    CHECK ((cust_id IS NOT NULL AND emp_id IS NULL) OR (cust_id IS NULL AND emp_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE login_attempt (
    attempt_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    cust_id       INT         NULL,
    emp_id        INT         NULL,
    success       BOOLEAN     NOT NULL,
    ip_address    VARCHAR(45) NULL,
    attempted_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cust_id) REFERENCES customer(cust_id),
    FOREIGN KEY (emp_id)  REFERENCES employee(emp_id),
    INDEX idx_login_time (attempted_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- I. DATABASE USER FOR THE BACKEND  (so the app never uses root)
--    Change this password and keep it identical in backend/.env
-- ---------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'bank_app'@'localhost' IDENTIFIED BY 'ChangeMe_App_1';
GRANT ALL PRIVILEGES ON bank_db.* TO 'bank_app'@'localhost';
FLUSH PRIVILEGES;
