import { useRef, useState } from 'react';

import { api, useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';

import {
  Alert, Badge, Button, Card, ErrorNote, Field,
  Input, Loading, Modal, Money, Select,
  StatusBadge, useAction, useToast
} from '@shared/ui.jsx';

import { can } from '../access.js';

export default function CustomerAccounts({ customer }) {
  const { user } = useAuth();

  const canView = can(user, 'VIEW_ACCOUNTS');
  const canOpen = can(user, 'OPEN_ACCOUNT');

  const accounts = useApi(
    canView
      ? `/employee/accounts/customer/${customer.customerId}`
      : null
  );

  const options = useApi(
    canOpen ? '/employee/accounts/options' : null
  );

  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [branchIfsc, setBranchIfsc] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState('');

  const pending = useRef(null);
  const submitting = useRef(false);

  const action = useAction();
  const toast = useToast();

  const eligible =
    customer.status === 'ACTIVE' &&
    customer.kycStatus === 'VERIFIED';

  const selectedType = options.data?.types.find(
    type => String(type.typeId) === typeId
  );

  if (!canView && !canOpen) return null;

  function submit(event) {
    event.preventDefault();

    if (submitting.current || !eligible) return;

    action.setError('');

    if (
      !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(amount)
    ) {
      action.setError(
        'Enter a non-negative amount with up to two decimal places.'
      );
      return;
    }

    const body = {
      customerId: customer.customerId,
      typeId,
      branchIfsc,
      openingAmount: amount
    };

    const signature = JSON.stringify(body);

    if (pending.current?.signature !== signature) {
      pending.current = {
        signature,
        key: crypto.randomUUID()
      };
    }

    submitting.current = true;

    action.run(async () => {
      try {
        const response = await api('/employee/accounts', {
          method: 'POST',

          body: {
            ...body,
            idempotencyKey: pending.current.key
          }
        });

        setResult(response.message);
        toast(response.message);

        pending.current = null;

        setOpen(false);
        setAmount('');
        setTypeId('');
        setBranchIfsc('');

        if (canView) accounts.reload();
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <section className="space-y-4 border-t border-line pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[21px]">
          Accounts for this customer
        </h3>

        <div className="flex gap-2">
          {canView && (
            <Button
              variant="secondary"
              size="sm"
              onClick={accounts.reload}
            >
              Refresh accounts
            </Button>
          )}

          {canOpen && (
            <Button
              size="sm"
              disabled={!eligible}
              onClick={() => {
                action.setError('');
                setOpen(true);
              }}
            >
              Open account
            </Button>
          )}
        </div>
      </div>

      {canOpen && !eligible && (
        <Alert tone="info">
          Account opening requires an active customer
          with verified KYC.
        </Alert>
      )}

      {result && <Alert tone="ok">{result}</Alert>}

      {canView && accounts.loading && <Loading />}

      {canView && accounts.error && (
        <ErrorNote onRetry={accounts.reload}>
          {accounts.error}
        </ErrorNote>
      )}

      {canView && accounts.data?.accounts.length === 0 && (
        <p className="text-sm text-ink-400">
          No accounts in your branch scope.
        </p>
      )}

      {canView && accounts.data?.accounts.map(account => (
        <Card
          key={account.accountNumber}
          className="space-y-2 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium tnum">
              {account.accountNumber} · {account.accountType}
            </span>

            <span className="flex gap-2">
              {account.isPrimary && (
                <Badge tone="violet">Primary</Badge>
              )}

              <StatusBadge status={account.status} />
            </span>
          </div>

          <p className="text-sm text-ink-400">
            {account.branchName} · {account.branchIfsc}
          </p>

          <Money value={account.balance} />
        </Card>
      ))}

      <Modal
        open={open}
        onClose={() => {
          if (!action.busy) setOpen(false);
        }}
        title="Open an account"
        width={560}
      >
        <p className="mb-4 text-sm text-ink-500">
          Customer #{customer.customerId}: {customer.name}
        </p>

        {options.error ? (
          <ErrorNote onRetry={options.reload}>
            {options.error}
          </ErrorNote>
        ) : !options.data ? (
          <Loading />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Branch">
              <Select
                value={branchIfsc}
                onChange={event =>
                  setBranchIfsc(event.target.value)
                }
                required
                disabled={action.busy}
              >
                <option value="">Select branch</option>

                {options.data.branches.map(branch => (
                  <option
                    key={branch.ifscCode}
                    value={branch.ifscCode}
                  >
                    {branch.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Account type">
              <Select
                value={typeId}
                onChange={event =>
                  setTypeId(event.target.value)
                }
                required
                disabled={action.busy}
              >
                <option value="">Select account type</option>

                {options.data.types.map(type => (
                  <option
                    key={type.typeId}
                    value={type.typeId}
                  >
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedType && (
              <p className="text-sm text-ink-400">
                Minimum opening balance:{' '}
                <Money value={selectedType.minBalance} />
                {' '}· Interest rate:{' '}
                {selectedType.interestRate}%
              </p>
            )}

            <Field label="Opening deposit">
              <Input
                value={amount}
                onChange={event =>
                  setAmount(event.target.value)
                }
                inputMode="decimal"
                maxLength={16}
                required
                disabled={action.busy}
              />
            </Field>

            <p className="text-sm text-ink-400">
              The opening deposit is recorded as cash,
              following the existing account-opening procedure.
              No new customer password is generated.
            </p>

            <Alert>{action.error}</Alert>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={action.busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                loading={action.busy}
                disabled={
                  !eligible || !branchIfsc || !typeId
                }
              >
                Create account
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}