# Internal demo payments

The customer site's Send money page transfers demo credits between ACTIVE accounts stored in this project's MySQL database. It does not use RazorpayX, a payment gateway, UPI rails, or real money. The internal identifier `<account number>@inkwell` is only a convenient alias for a local account number, not a real UPI ID.

A recipient selects their account under **Receive with QR** and shares the QR image or internal ID. Scanning the QR opens this site's Send money page with the recipient ID filled in. The sender selects an owned account, enters the amount and their transaction PIN, and confirms. The backend checks the PIN and ownership, locks both account rows, debits and credits in one SQL transaction, and records one successful `INTERNAL` entry in `bank_transaction`. The request UUID prevents a second debit for an identical repeated request. Both parties can see the resulting balance and transaction in the existing account pages. The sender can set up a transaction PIN under Security.

For an existing database, run `database/internal_payment_mode.sql` once before starting the new backend. The base `database/schema.sql` includes the same enum value for fresh databases.

The QR contains a URL, so a phone must be able to reach this site for the link to open. A localhost URL works only on the same computer. For phones on a network, deploy the site at a reachable URL and use HTTPS. Never describe the internal alias or QR as an interoperable UPI payment address.

The previous RazorpayX test routes and background polling are no longer mounted in the running app. Test credentials remain in the ignored local configuration file until manually removed. Existing test payout rows are not deleted or migrated by this change.

## Database balances and payment status

Each successful internal payment updates the sender and recipient balances in the `account` table and writes a `SUCCESS` row in `bank_transaction`. The same database transaction also writes a `DONE` row in `internal_payment_attempt`. If an attempted transfer fails a business check or PIN verification, neither balance changes, and an `internal_payment_attempt` row records `FAILED` with a reason. Requests rejected before transfer validation and uncertain server or database errors are not marked as failed payments.

For an existing database, run `database/internal_payment_attempt.sql` once. To inspect current balances and recent outcomes in MySQL Workbench, run `database/payment_status_report.sql`. The `.sql` files are definitions and read-only reports; payment data itself is stored in MySQL tables. The report's balance columns are current balances, not historical snapshots at the moment of each attempt.
