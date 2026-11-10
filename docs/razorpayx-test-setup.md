# RazorpayX test payouts

This is a **test-only prototype**. It creates a RazorpayX UPI payout using a demo account and reserves the corresponding amount in this project's demo database. It is not a bank integration, and does not transfer real customer account funds. Do not use with production data or live keys.

## Setup

1. Sign up at https://razorpay.com/x/ and request RazorpayX Payouts test access. Ordinary Razorpay Payment Gateway checkout credentials alone do not establish payout access.
2. Obtain your RazorpayX test API key ID, secret and test payout account number or identifier from the provider. Complete any provider requirements such as API IP allowlisting and test balance funding. Keep secrets private.
3. In `backend/.env.razorpay` on your Desktop project, fill in `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, and `RAZORPAYX_ACCOUNT_NUMBER`, then set `RAZORPAYX_TEST_ENABLED=true`. The file is ignored by Git. The client accepts only key IDs beginning `rzp_test_`.
4. Start the local demo MySQL server. From the `backend` directory run `node scripts/setup-razorpay-test.js`. This adds one table to the database configured by `DATABASE_URL`; it does not recreate the database.
5. Restart the backend and sign into the customer portal. Set the account transaction PIN if needed, then use **Send to UPI ID — RazorpayX test**.

The backend creates the payout using a unique idempotency key. A request that times out stays reserved: never submit a fresh request simply because the first status is unknown. The server checks known pending payouts every 30 seconds while running, and the page updates automatically while open. The Check status button remains available. If the provider response is lost before the payout ID is recorded, automatic lookup/release is unavailable unless a verified webhook supplies the ID. Keep the reservation until an operator has independently verified the outcome.

For webhook notifications, expose the backend through an appropriately secured public HTTPS endpoint, configure the RazorpayX **test** webhook URL as `/api/webhooks/razorpayx-test`, and subscribe to payout status events. Set the same independently generated webhook secret as `RAZORPAYX_WEBHOOK_SECRET` in the ignored `backend/.env.razorpay` and restart the backend. Never use the API secret as the webhook secret. Incoming signatures are checked over the raw body and the current payout state is fetched from RazorpayX before updating the demo ledger. No public tunnel or provider webhook is configured automatically; local-only installations still use periodic polling for payouts whose provider ID is known. Delivery failures are returned as errors so RazorpayX can retry.

Provider response fields, test onboarding, payout balance, and status reconciliation must be tested with a real RazorpayX test account. A production system additionally needs appropriate bank/UPI partnerships, regulatory approval, an audited ledger, reliable reconciliation, strong security review, and provider approval. Changing the test key to a live key is intentionally blocked.
