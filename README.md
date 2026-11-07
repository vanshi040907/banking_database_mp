Banking Database Management System (DBIS Minor Project)
A banking database project using MySQL 8, Node.js + Express, Prisma ORM v6, and planned React customer and employee portals. The project includes role-based employee permissions, password-and-OTP login, account management, and a database foundation for transactional banking operations.
> **Project status (23 October 2026):** Customer and employee login, OTP verification, JWT-protected requests, and password change have been tested successfully. The customer **accounts listing API has also been tested successfully**. The transaction-history API code has been provided but its local test result has not yet been confirmed. React portals, money-transfer HTTP APIs, and plain-English search are planned/not yet confirmed implemented.
Repository structure
```text
banking_db/
├── database/
│   ├── schema.sql
│   ├── procedures.sql
│   ├── views.sql
│   └── seed.sql
├── backend/
│   ├── app.js
│   ├── db.js
│   ├── .env.example
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma
│   ├── routes/
│   │   ├── auth.js
│   │   └── customer.js                 # customer accounts/history routes
│   ├── controllers/
│   │   └── customerController.js       # customer accounts/history handlers
│   ├── middleware/
│   │   └── auth.js
│   ├── utils/
│   │   └── wrap.js
│   └── scripts/
│       └── set-test-passwords.js
├── user/                              # planned React customer portal
└── admin/                             # planned React employee portal
```
The structure above reflects files discussed or implemented so far; verify that `routes/customer.js` and `controllers/customerController.js` are committed before teammates try those endpoints. The React folders may not exist yet.
1. Prerequisites
Tool	Recommended version	Check
Node.js	22 LTS	`node -v`
npm	Bundled with Node	`npm -v`
MySQL Server and Workbench	MySQL 8.0.16+	Connect in Workbench
Git	Current version	`git --version`
Thunder Client (VS Code)	Optional	VS Code Extensions
The commands below assume Windows PowerShell unless otherwise stated.
2. Clone and install
```powershell
git clone <REPO_URL>
cd banking_db
cd backend
npm install
```
Replace `<REPO_URL>` with your actual Git repository URL.
3. Create your local database
The MySQL database itself is not committed to Git. Every collaborator builds their own local database from the SQL scripts.
In MySQL Workbench, connect to your local MySQL server and execute the following scripts in order:
`database/schema.sql`
`database/procedures.sql`
`database/views.sql`
`database/seed.sql`
> **WARNING:** `schema.sql` contains `DROP DATABASE IF EXISTS bank_db;`. Re-running it **deletes all data in that database**, including any accounts, transactions, and password changes created during testing. Do not run it on a database containing data you need to preserve. Coordinate schema resets with the team.
Verify setup in Workbench:
```sql
USE bank_db;
SHOW TABLES;                         -- 24 base tables (views appear too)
SELECT acc_no, cust_id, balance FROM account;  -- 5 seeded accounts
SELECT emp_id, emp_name, status FROM employee; -- 8 seeded employees
```
The schema creates a local MySQL application user named `bank_app`. The sample password defined in `schema.sql` is for local development only. Do not use these credentials in a deployed environment.
Database contents
24 base tables, including branch, employee, customer, account, account type, transaction, roles, permissions, audit logs, OTP verification, and login attempts.
Stored procedures: `sp_transfer`, `sp_cash_deposit`, `sp_cash_withdraw`, `sp_open_account`, `sp_close_account`, `sp_set_account_status`, `sp_set_primary_account`.
Permission function: `fn_has_permission`.
Views: `v_transaction_history`, `v_account_overview`, `v_branch_deposits`.
Seed data: 2 branches, 8 employees, 4 customers, 5 accounts, and sample transactions.
Account closure changes status to `CLOSED`; accounts and their history must not be hard-deleted. Cards, fixed deposits, and loans exist in the schema but are out of scope for the current API phase.
4. Configure the backend
From the `backend/` directory:
```powershell
Copy-Item .env.example .env
```
Set the required values in `backend/.env`, using the exact variable names from `.env.example` (including `DATABASE_URL`, `JWT_SECRET`, and optionally `PORT`). The MySQL URL should use the format:
```dotenv
DATABASE_URL="mysql://bank_app:<LOCAL_PASSWORD>@localhost:3306/bank_db"
JWT_SECRET="<GENERATE_A_RANDOM_SECRET>"
PORT=5000
```
Replace the placeholders; never commit real credentials. Generate a random JWT secret with:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Prisma is pinned to version 6 (previously 6.19.3). Do not upgrade to Prisma 7 or introduce `prisma.config.ts` without a team-wide migration plan.
```powershell
npx prisma generate
node scripts/set-test-passwords.js
npm run dev
```
The password setup script resets seeded user passwords to `Test@1234` for local testing. Do not rerun it casually after changing passwords: it may overwrite the passwords you just tested. Never run this script in production.
Health check:
```http
GET http://localhost:5000/health
```
Expected: JSON with `status: "ok"` and the seeded branches.
5. API status and test routes
Base URL: `http://localhost:5000`
Method	Endpoint	Purpose	Status
GET	`/health`	Backend/database connectivity	Tested
POST	`/api/auth/customer/login`	Customer account-number/password check; issues OTP	Tested
POST	`/api/auth/employee/login`	Employee ID/password check; issues OTP	Tested
POST	`/api/auth/verify-otp`	Verify OTP and issue JWT	Tested
POST	`/api/auth/change-password`	Change authenticated user's password	Tested
GET	`/api/me`	Inspect authenticated JWT identity	Tested
GET	`/api/test/freeze-permission`	Test role-based permission	Available in supplied code; verify locally
GET	`/api/customer/accounts`	List logged-in customer's accounts	Tested successfully
GET	`/api/customer/accounts/:accNo/transactions`	Paginated account transaction history	Code supplied; local test unconfirmed
> Route availability depends on whether the corresponding code has been added and committed to the branch you are running. Do not assume an endpoint is present solely because it appears in this README.
Seed login accounts
All seeded users start with password `Test@1234` after the password setup script is run, unless their password has subsequently been changed.
Customer	Account number
Vanshika	`1000000001`
Sushmita	`1000000002`
Adi	`1000000003`
Vishruth	`1000000004`
Vanshika also has a second account: `1000000005`.
Employee ID	Role	Branch
1	Manager	Indore
2	Account Officer	Indore
3	Cashier	Indore
4	Analyst	Indore (all-branch permission)
5	Customer Service	Indore
6	Manager	Bhopal
7	Account Officer	Bhopal
8	Admin	Indore (all-branch permission)
Test customer login
POST `/api/auth/customer/login`
```json
{
  "accNo": "1000000001",
  "password": "Test@1234"
}
```
Test employee login
POST `/api/auth/employee/login`
```json
{
  "empId": 1,
  "password": "Test@1234"
}
```
Both return `otpRequired: true` and an `otpToken` when credentials are correct. During development, the six-digit OTP is printed in the backend terminal (`[DEV ONLY] OTP ...`). It expires after approximately five minutes. This is not a production delivery method; SMS integration is planned later.
Verify OTP (both login types)
POST `/api/auth/verify-otp`
```json
{
  "otpToken": "PASTE_OTP_TOKEN_FROM_LOGIN",
  "otp": "PASTE_SIX_DIGIT_CODE_FROM_TERMINAL"
}
```
The response includes a different `token` (the real login JWT), `userType`, and `mustChangePassword`.
For protected endpoints, send this header in Thunder Client:
```http
Authorization: Bearer YOUR_LOGIN_JWT
```
Do not use the `otpToken` as the bearer token. Login JWTs expire after one hour in the current implementation.
First-login password change
POST `/api/auth/change-password` with the login JWT:
```json
{
  "currentPassword": "Test@1234",
  "newPassword": "A-New-Unique-Password-2026"
}
```
The backend hashes the new password and clears `must_change_password`. If the password-change guard is installed on a protected route, users whose `must_change_password` flag is true must change their password before using that route. Log in again after changing the password.
Fetch customer accounts — tested
GET `/api/customer/accounts` with a customer JWT:
```http
GET http://localhost:5000/api/customer/accounts
Authorization: Bearer YOUR_CUSTOMER_JWT
```
The API derives the customer ID from the JWT (not from a user-supplied ID) and returns all accounts belonging to that customer, including account number, type, balance, branch, status, and primary-account flag. Account numbers and monetary values are serialized as strings to avoid JavaScript `BigInt`/decimal precision issues.
Fetch transaction history — test pending
GET `/api/customer/accounts/1000000001/transactions?page=1&limit=10` with customer JWT.
This endpoint uses `v_transaction_history`, returns credits/debits from the selected account's perspective, verifies account ownership, and supports pagination. Test it before marking it complete. Using customer 1's JWT to request account `1000000002` should return 404, not another customer's history.
Basic permission test
GET `/api/test/freeze-permission` with an employee JWT. A manager has `FREEZE_ACCOUNT`; a cashier does not. This is a temporary test route and should be removed or restricted before deployment.
6. Permissions and business rules
Employees have one role each. Roles are mapped to permissions through `role_permission`.
Backend endpoints must check the employee's permission and branch scope. By default, employees access only their own branch unless they have `ACCESS_ALL_BRANCHES`.
Customers can own multiple accounts. One active account is designated primary for mobile-number transfers.
Mobile-number transfers will resolve a customer through `customer_phone`, find their primary account, then call `sp_transfer`.
Account opening/closing, freezing/unfreezing, deposits, withdrawals, and transfers are handled by stored procedures to keep balance changes atomic.
Customer address, phone, and email edits will use Prisma transactions that also write an audit entry.
A new customer receives a temporary password and must change it on first login.
Savings summaries will calculate money in minus money out for a selected week/month/year.
Frequent payees will be derived from transaction history; no separate payees table is needed.
Analysts should not receive personal information they lack permission to view.
Security work still pending: enforce branch scope consistently (including stored procedure entry points), strengthen OTP concurrency/ownership checks, prevent duplicate transfers with idempotency, review session invalidation after password changes, and configure restrictive CORS for deployment. Do not deploy as a real banking service in its current state.
7. Planned work
Verify transaction-history endpoint, pagination, and cross-customer access denial.
Build customer transfer APIs using `sp_transfer`, including account-number and mobile-number recipients.
Implement primary-account selection, savings summaries, and recent/frequent payees.
Build employee APIs for customer registration, customer-detail updates, cash operations, account management, and audit logging.
Add branch-scoped authorization and complete security/concurrency tests.
Build React customer (`user/`) and employee (`admin/`) portals.
Add validated, read-only plain-English-to-SQL search and later OTP delivery integration.
8. Team collaboration workflow
Before starting work
```powershell
git checkout main
git pull origin main
git checkout -b feature/short-description
```
Work in your own branch; avoid direct commits to `main`. Make focused commits and open a pull request for review:
```powershell
git status
git add <specific-files>
git commit -m "Add customer transaction history endpoint"
git push -u origin feature/short-description
```
Prefer staging specific files over `git add .` so you don't accidentally commit local configuration or secrets. After your PR is merged, pull the updated `main` before starting new work.
Never commit
`backend/.env`, any `.env` with real secrets, or private keys
`node_modules/`
OTPs, JWTs, database passwords, or screenshots containing secrets
Real customer identity or financial data
Keep `.env.example` in Git with placeholder values only. Check that `.gitignore` covers these files. If a secret is accidentally committed, remove it from the repository and rotate it; deleting it from a later commit does not make the leaked secret safe.
Database changes
The SQL files in `database/` are the source of truth; don't make schema changes only through the Workbench GUI.
For a schema change:
Discuss the change with collaborators before editing shared tables/procedures.
Edit the appropriate `.sql` file(s).
Back up any local data you want to preserve before re-running destructive scripts.
Re-run SQL scripts in the documented order in a disposable local database.
From `backend/`, run:
```powershell
   npx prisma db pull
   npx prisma generate
   ```
Commit both the SQL changes and any changed `backend/prisma/schema.prisma`.
In the PR, document which database scripts teammates must re-run and whether their local data will be reset.
Note: `npx prisma db pull` updates the Prisma model from MySQL; it does not replace the SQL scripts or automatically implement stored procedures. Warnings about MySQL `CHECK` constraints during introspection do not mean MySQL stopped enforcing them.
API development conventions
Routes define endpoints and apply middleware.
Middleware authenticates and authorizes requests.
Controllers validate inputs and build HTTP responses.
Prisma performs ordinary data access; stored procedures handle atomic money operations.
Derive logged-in customer/employee IDs from verified JWT claims, never trust identity fields supplied in a request body.
Use parameterized Prisma queries; never concatenate user input into SQL.
Add Thunder Client test steps and negative tests (wrong user, missing JWT, insufficient permission) for each new endpoint.
Do not return password hashes, OTP hashes, identity-document numbers, or other unnecessary sensitive fields.
9. Troubleshooting
Problem	What to check
`Access denied for user 'bank_app'`	MySQL user/password and `DATABASE_URL`; note that `CREATE USER IF NOT EXISTS` does not reset an existing user's password
`Can't reach database server`	MySQL Windows service is running; host/port are correct
`Environment variable not found: DATABASE_URL`	`backend/.env` exists and dotenv is loaded
`the URL must start with mysql://`	Database URL format or conflicting Windows environment variable
`@prisma/client did not initialize yet`	Run `npx prisma generate` in `backend/`
`Invalid credentials` for seeded users	Confirm seed was run; run password setup script if a reset is intended
`401 Login required`	Add `Authorization: Bearer <login JWT>`; do not use OTP token
`401 Invalid or expired token`	Log in and verify OTP again; JWT expires after one hour
`403 PASSWORD_CHANGE_REQUIRED`	Change the temporary password, then log in again
`403 You do not have permission`	Check employee role, permission assignment, and relevant branch scope
`404 Account not found` on history	Confirm the account belongs to the JWT's customer
Prisma relation name error	Compare controller relation names with the actual `prisma/schema.prisma` generated by `db pull`
`db pull` warns about check constraints	MySQL still enforces them; warning is informational
10. Project limitations
This is an educational prototype, not a production banking system. Use fictional test data only. Authentication, permissions, financial transaction integrity, input validation, audit logging, and operational security require further review before any real-world use.
### Cashfree phone payouts (sandbox only)

The customer Send money screen can submit a **test** phone payout to Cashfree and check its status. This uses the Cashfree Payouts test environment and test data only; it does not debit or credit this project's accounts. The UPI app handoff is separate and its status cannot be verified by Cashfree. Do not use this integration for real money.

1. Configure the existing MySQL database and `backend/.env` as above. Run `database/02_cashfree_sandbox.sql` against the existing `bank_db` database in MySQL Workbench. This adds a table without resetting existing tables. Do **not** re-run `schema.sql` on a database containing data you want to keep.
2. Add Payouts test credentials to the Git-ignored `backend/.env.cashfree`:

   ```dotenv
   CASHFREE_CLIENT_ID=your_test_client_id
   CASHFREE_CLIENT_SECRET=your_test_client_secret
   ```

3. Configure the Cashfree Payouts test account's [IP allowlist or public key authentication](https://www.cashfree.com/docs/payouts/payouts/integrations/payouts-2fa). The current implementation supports IP allowlisting. Run `node scripts/check-cashfree.js` from `backend` to check sandbox authentication without printing keys.
4. Start the backend and customer portal, sign in as a customer and open Send money. Use only [Cashfree test data](https://www.cashfree.com/docs/payouts/payouts/integrations/data-to-test). A test submission is stored with a stable ID. If its outcome is unknown, retry with the same details to recover that ID and check its status; do not assume payment succeeded.

The backend never sends a request to Cashfree's production endpoint. Live payouts would require provider activation, appropriate authorization, a real funds/ledger design and additional end-to-end testing.