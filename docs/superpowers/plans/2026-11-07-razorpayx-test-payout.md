# RazorpayX Test Payout Implementation Plan

**Goal:** Let a customer initiate and reconcile a UPI-ID payout in RazorpayX Test Mode using only demo account balances.

**Architecture:** The backend reserves a demo balance atomically with a durable request and reuses one idempotency key. It sends only test-key API requests, reconciles verified provider state, and never treats network errors as failure. The customer portal displays test-only status and preserves the request after uncertain outcomes. A production money ledger and live keys are out of scope.

**Tech Stack:** Express, MySQL 8, React, Node.js test runner, RazorpayX Payouts API.

**Constraints:** Never accept live keys. Never record a successful payout solely from request acceptance. Never release a balance for an uncertain provider outcome. Never expose credentials. Duplicate or out-of-order reconciliation must not change balances twice.

**Tasks:**
1. Add tests for provider request format, test-key enforcement and error handling; implement the server-side client.
2. Add a non-destructive database migration and tests for atomic reservations, insufficient funds, duplicate requests and guarded reconciliation.
3. Add authenticated endpoints, transaction-PIN enforcement, owner-only status checks and a test-only portal form.
4. Run unit, database concurrency and frontend build checks; document configuration and limitations. Test against Razorpay only after test credentials are available.
