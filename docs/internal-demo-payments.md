# Internal demo payments

The customer site's Send money page transfers demo credits between ACTIVE accounts stored in this project's MySQL database. It does not use RazorpayX, a payment gateway, UPI rails, or real money. The internal identifier `<account number>@inkwell` is only a convenient alias for a local account number, not a real UPI ID.

A recipient selects their account under **Receive with QR** and shares the QR image or internal ID. Scanning the QR opens this site's Send money page with the recipient ID filled in. The sender selects an owned account, enters the amount and their transaction PIN, and confirms. The backend checks the PIN and ownership, locks both account rows, debits and credits in one SQL transaction, and records one successful `INTERNAL` entry in `bank_transaction`. The request UUID prevents a second debit for an identical repeated request. Both parties can see the resulting balance and transaction in the existing account pages. The sender can set up a transaction PIN under Security.

For an existing database, run `database/internal_payment_mode.sql` once before starting the new backend. The base `database/schema.sql` includes the same enum value for fresh databases.

The QR contains a URL, so a phone must be able to reach this site for the link to open. A localhost URL works only on the same computer. For phones on a network, deploy the site at a reachable URL and use HTTPS. Never describe the internal alias or QR as an interoperable UPI payment address.

The previous RazorpayX test routes and background polling are no longer mounted in the running app. Test credentials remain in the ignored local configuration file until manually removed. Existing test payout rows are not deleted or migrated by this change.
