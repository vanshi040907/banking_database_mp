import { useRef, useState } from 'react';

import { api, useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';

import {
  Alert, Button, Card, ErrorNote, Field, Input,
  KV, Loading, Modal, Money, PageHeader, Select,
  StatusBadge, Textarea, useAction, useToast
} from '@shared/ui.jsx';

import { can } from '../access.js';

const positiveAmount = value =>
  /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value) &&
  !/^0(?:\.0{1,2})?$/.test(value);

function readPending(key) {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(key) || 'null'
    );

    return (
      value &&
      typeof value.accountNumber === 'string' &&
      ['DEPOSIT', 'WITHDRAWAL'].includes(value.kind) &&
      typeof value.amount === 'string' &&
      positiveAmount(value.amount) &&
      typeof value.remarks === 'string' &&
      typeof value.idempotencyKey === 'string'
    ) ? value : null;
  } catch {
    return null;
  }
}

function Receipt({ receipt }) {
  return (
    <Card className="mt-6 space-y-3 p-6">
      <h2 className="text-[24px]">Cash receipt</h2>

      <dl className="grid gap-x-8 sm:grid-cols-2">
        <KV k="Transaction" v={receipt.transactionId} />
        <KV k="Operation" v={receipt.kind} />
        <KV k="Account" v={receipt.accountNumber} />

        <KV
          k="Amount"
          v={<Money value={receipt.amount} />}
        />

        <KV
          k="Branch"
          v={`${receipt.branchName} (${receipt.branchIfsc})`}
        />

        <KV k="Employee" v={receipt.employeeId} />

        <KV
          k="Balance before operation"
          v={<Money value={receipt.balanceBefore} />}
        />

        <KV
          k="Balance after operation"
          v={<Money value={receipt.balanceAfter} />}
        />
      </dl>

      <p className="break-all text-sm text-ink-400">
        Reference: {receipt.referenceNumber}
      </p>

      <p className="text-sm text-ink-400">
        {new Date(receipt.date).toLocaleString('en-IN')}
      </p>
    </Card>
  );
}

export default function CashCounter() {
  const { user } = useAuth();

  const storageKey = `inkwell.cash.pending.${user.id}`;

  const [pending, setPending] = useState(
    () => readPending(storageKey)
  );

  const [query, setQuery] = useState(
    pending?.accountNumber ?? ''
  );

  const [account, setAccount] = useState(null);

  const [kind, setKind] = useState(
    can(user, 'CASH_DEPOSIT') ? 'DEPOSIT' : 'WITHDRAWAL'
  );

  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const lookupAction = useAction();
  const action = useAction();
  const locked = useRef(false);

  const recent = useApi('/employee/cash/recent');
  const toast = useToast();

  function clearPending() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // A retained key can only replay the same operation.
    }

    setPending(null);
  }

  function lookup(event) {
    event.preventDefault();

    if (pending || lookupAction.busy || action.busy) return;

    lookupAction.run(async () => {
      setAccount(null);

      const result = await api(
        `/employee/cash/accounts/${encodeURIComponent(query.trim())}`
      );

      setAccount(result.account);
      action.setError('');
    });
  }

  function review(event) {
    event.preventDefault();
    action.setError('');

    if (
      !account ||
      pending ||
      action.busy ||
      account.status !== 'ACTIVE'
    ) {
      return;
    }

    if (!positiveAmount(amount)) {
      action.setError(
        'Enter a positive amount with up to two decimal places.'
      );
      return;
    }

    setConfirmation({
      accountNumber: account.accountNumber,
      kind,
      amount,
      remarks: remarks.trim(),
      idempotencyKey: crypto.randomUUID()
    });
  }

  function send(payload) {
    if (locked.current) return;

    locked.current = true;

    action.run(async () => {
      try {
        // Save before sending so a reload can recover the request.
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify(payload)
          );
        } catch {
          throw new Error(
            'Cannot save the pending request in this tab. Enable session storage before recording cash.'
          );
        }

        setPending(payload);
        setReceipt(null);

        const result = await api(
          '/employee/cash/operations',
          { method: 'POST', body: payload }
        );

        clearPending();
        setReceipt(result.receipt);
        setAmount('');
        setRemarks('');
        setConfirmation(null);

        toast('Cash operation recorded');
        recent.reload();

        try {
          const refreshed = await api(
            `/employee/cash/accounts/${payload.accountNumber}`
          );

          setAccount(refreshed.account);
          setQuery(payload.accountNumber);
        } catch {
          setAccount(null);
        }
      } catch (error) {
        if (error.code === 'CASH_NOT_RECORDED') {
          clearPending();
        }

        setConfirmation(null);
        throw error;
      } finally {
        locked.current = false;
      }
    });
  }

  const busy = action.busy || lookupAction.busy;

  return (
    <div className="soft-in">
      <PageHeader
        title="Cash counter"
        subtitle={
          user.scope === 'ALL_BRANCHES'
            ? 'Record cash operations across branches.'
            : `Cash operations at ${user.branch.name}.`
        }
      />

      {pending && (
        <Alert tone="info" className="mb-5">
          <p>
            Saved request: {pending.kind} · account{' '}
            {pending.accountNumber} ·{' '}
            <Money value={pending.amount} />.
          </p>

          <p>
            Its outcome has not been confirmed in this tab.
            Retry this saved request to retrieve its result
            without recording it twice.
          </p>

          <Button
            size="sm"
            loading={action.busy}
            onClick={() => send(pending)}
          >
            Retry saved request
          </Button>
        </Alert>
      )}

      <Alert className="mb-4">{action.error}</Alert>

      <Card className="space-y-4 p-6">
        <form
          onSubmit={lookup}
          className="flex flex-wrap items-end gap-3"
        >
          <Field
            label="Account number"
            className="min-w-[240px] flex-1"
          >
            <Input
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setAccount(null);
              }}
              inputMode="numeric"
              maxLength={20}
              required
              disabled={busy || !!pending}
            />
          </Field>

          <Button
            type="submit"
            loading={lookupAction.busy}
            disabled={busy || !!pending}
          >
            Find account
          </Button>
        </form>

        <Alert>{lookupAction.error}</Alert>

        {account && (
          <>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <KV k="Account" v={account.accountNumber} />
              <KV k="Type" v={account.accountType} />
              <KV k="Branch" v={account.branchName} />

              <KV
                k="Status"
                v={<StatusBadge status={account.status} />}
              />

              <KV
                k="Current balance"
                v={<Money value={account.balance} />}
              />

              {account.customerName != null && (
                <KV k="Customer" v={account.customerName} />
              )}
            </dl>

            {account.status !== 'ACTIVE' && (
              <Alert tone="info">
                Only active accounts can receive cash counter operations.
              </Alert>
            )}

            <form
              onSubmit={review}
              className="space-y-4 border-t border-line pt-4"
            >
              <Field label="Operation">
                <Select
                  value={kind}
                  onChange={event => setKind(event.target.value)}
                  disabled={busy || !!pending}
                >
                  {can(user, 'CASH_DEPOSIT') && (
                    <option value="DEPOSIT">Cash deposit</option>
                  )}

                  {can(user, 'CASH_WITHDRAW') && (
                    <option value="WITHDRAWAL">Cash withdrawal</option>
                  )}
                </Select>
              </Field>

              <Field label="Amount">
                <Input
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  inputMode="decimal"
                  maxLength={16}
                  required
                  disabled={busy || !!pending}
                />
              </Field>

              <Field label="Remarks (optional)">
                <Textarea
                  value={remarks}
                  onChange={event => setRemarks(event.target.value)}
                  maxLength={255}
                  disabled={busy || !!pending}
                />
              </Field>

              <Button
                type="submit"
                disabled={
                  busy ||
                  !!pending ||
                  account.status !== 'ACTIVE'
                }
              >
                Review cash entry
              </Button>
            </form>
          </>
        )}
      </Card>

      {receipt && <Receipt receipt={receipt} />}

      <Card className="mt-6 space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[21px]">
            Recent cash operations
          </h2>

          <Button
            variant="secondary"
            size="sm"
            onClick={recent.reload}
          >
            Refresh
          </Button>
        </div>

        <p className="text-sm text-ink-400">
          Latest 20. Cashiers see their own branch entries;
          Admin sees all branches. Select an entry to view its receipt.
        </p>

        {recent.loading && <Loading />}

        {recent.error && (
          <ErrorNote onRetry={recent.reload}>
            {recent.error}
          </ErrorNote>
        )}

        {!recent.loading && recent.data?.receipts.length === 0 && (
          <p className="text-sm text-ink-400">
            No cash counter entries yet.
          </p>
        )}

        {!recent.loading && recent.data?.receipts.map(item => (
          <button
            type="button"
            key={item.transactionId}
            onClick={() => setReceipt(item)}
            className="flex w-full flex-wrap justify-between gap-3 rounded-lg border border-line p-4 text-left hover:bg-violet-50"
          >
            <span>
              #{item.transactionId} · {item.kind}

              <span className="block text-sm text-ink-400">
                Account {item.accountNumber} · {item.branchName}
              </span>
            </span>

            <Money value={item.amount} />
          </button>
        ))}
      </Card>

      <Modal
        open={!!confirmation}
        onClose={() => {
          if (!action.busy) setConfirmation(null);
        }}
        title="Confirm cash entry"
      >
        {confirmation && (
          <div className="space-y-4">
            <p>
              {confirmation.kind} · account{' '}
              {confirmation.accountNumber}
            </p>

            <p className="text-[24px]">
              <Money value={confirmation.amount} />
            </p>

            <p className="text-sm text-ink-400">
              Confirm the cash counter operation before recording this entry.
            </p>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={action.busy}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </Button>

              <Button
                loading={action.busy}
                onClick={() => send(confirmation)}
              >
                Confirm and record
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}