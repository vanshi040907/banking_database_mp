# RazorpayX test payouts

This is a **test-only prototype**. It creates a RazorpayX UPI payout using a demo account and reserves the corresponding amount in this project's demo database. It is not a bank integration, and does not transfer real customer account funds. Do not use with production data or live keys.

## Setup

1. Sign up at https://razorpay.com/x/ and request RazorpayX Payouts test access. Ordinary Razorpay Payment Gateway checkout credentials alone do not establish payout access.
2. Obtain your RazorpayX test API key ID, secret and test payout account number or identifier from the provider. Complete any provider requirements such as API IP allowlisting and test balance funding. Keep secrets private.
3. In `backend/.env.razorpay` on your Desktop project, fill in `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, and `RAZORPAYX_ACCOUNT_NUMBER`, then set `RAZORPAYX_TEST_ENABLED=true`. The file is ignored by Git. The client accepts only key IDs beginning `rzp_test_`.
4. Start the local demo MySQL server. From the `backend` directory run `node scripts/setup-razorpay-test.js`. This adds one table to the database configured by `DATABASE_URL`; it does not recreate the database.
5. Restart the backend and sign into the customer portal. Set the account transaction PIN if needed, then use **Send to UPI ID — RazorpayX test**.

The backend creates the payout using a unique idempotency key. A request that times out stays reserved: never submit a fresh request simply because the first status is unknown. Ask an administrator to check the matching request ID in RazorpayX and reconcile the record. A provider payout ID enables the Check status button to fetch the latest status directly. This prototype has no webhook or automatic background reconciliation. If the provider response is lost before the payout ID is recorded, automatic lookup/release is unavailable. Keep the reservation until an operator has independently verified the outcome.

Provider response fields, test onboarding, payout balance, and status reconciliation must be tested with a real RazorpayX test account. A production system additionally needs appropriate bank/UPI partnerships, regulatory approval, an audited ledger, reliable reconciliation, strong security review, and provider approval. Changing the test key to a live key is intentionally blocked.
