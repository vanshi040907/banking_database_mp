import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';

import {
  Alert, Badge, Button, Card, ErrorNote, Field, Input,
  KV, Loading, Modal, Money, PageHeader, Select,
  StatusBadge, Textarea, useAction, useToast
} from '@shared/ui.jsx';

import { fmtDate } from '@shared/format.js';
import { can } from '../access.js';

function History({ accountNumber }) {
  const [page, setPage] = useState(1);

  const state = useApi(
    `/employee/accounts/${accountNumber}/transactions?page=${page}`
  );

  return (
    <section className="space-y-4 border-t border-line pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[21px]">Transaction history</h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={state.reload}
        >
          Refresh
        </Button>
      </div>

      {state.loading && <Loading />}

      {state.error && (
        <ErrorNote onRetry={state.reload}>
          {state.error}
        </ErrorNote>
      )}

      {!state.loading && state.data?.transactions.length === 0 && (
        <p className="text-sm text-ink-400">No transactions.</p>
      )}

      {!state.loading && state.data?.transactions.map(transaction => (
        <div
          key={transaction.transactionId}
          className="space-y-1 rounded-lg border border-line p-4"
        >
          <div className="flex flex-wrap justify-between gap-3">
            <span>
              {transaction.direction} · {transaction.type} · {transaction.mode}
            </span>

            <span className="flex items-center gap-2">
              <Money value={transaction.amount} />
              <StatusBadge status={transaction.status} />
            </span>
          </div>

          <p className="text-sm text-ink-400">
            {new Date(transaction.date).toLocaleString('en-IN')}
          </p>

          <p className="break-all text-xs text-ink-400">
            Reference: {transaction.referenceNumber}
          </p>

          {transaction.counterpartyAccount && (
            <p className="text-sm">
              Other account: {transaction.counterpartyAccount}
            </p>
          )}

          {transaction.remarks && (
            <p className="text-sm">{transaction.remarks}</p>
          )}
        </div>
      ))}

      {state.data && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            disabled={page <= 1 || state.loading}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>

          <span className="text-sm">
            Page {page} · {state.data.total} transactions
          </span>

          <Button
            variant="secondary"
            disabled={page >= state.data.totalPages || state.loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}

function AccountDetails({ accountNumber, onChanged }) {
  const { user } = useAuth();
  const state = useApi(`/employee/accounts/${accountNumber}`);

  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');

  const action = useAction();
  const toast = useToast();
  const account = state.data?.account;

  if (state.error) {
    return (
      <ErrorNote onRetry={state.reload}>
        {state.error}
      </ErrorNote>
    );
  }

  if (!account) return <Loading />;

  const zero = /^0(?:\.0+)?$/.test(account.balance);
  const inactive = action.busy || state.loading;

  function choose(kind) {
    setTarget(kind);
    setReason('');
    action.setError('');
  }

  function closeModal() {
    if (!action.busy) setTarget(null);
  }

  function submit(event) {
    event.preventDefault();

    if (!target || action.busy) return;

    action.run(async () => {
      const closing = target === 'CLOSE';

      const result = await api(
        `/employee/accounts/${accountNumber}/${closing ? 'close' : 'status'}`,
        {
          method: 'PATCH',

          body: closing
            ? { reason }
            : {
                reason,
                status: target === 'FREEZE'
                  ? 'FROZEN'
                  : 'ACTIVE'
              }
        }
      );

      toast(result.message);
      setTarget(null);
      setReason('');
      state.reload();
      onChanged();
    });
  }

  return (
    <Card className="mt-6 space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[25px] tnum">
          Account {account.accountNumber}
        </h2>

        <Button
          variant="secondary"
          size="sm"
          onClick={state.reload}
        >
          Refresh details
        </Button>
      </div>

      <dl className="grid gap-x-8 sm:grid-cols-2">
        <KV
          k="Balance"
          v={<Money value={account.balance} />}
        />

        <KV
          k="Status"
          v={<StatusBadge status={account.status} />}
        />

        <KV k="Account type" v={account.accountType} />

        <KV
          k="Branch"
          v={`${account.branchName} (${account.branchIfsc})`}
        />

        <KV k="Opened" v={fmtDate(account.openingDate)} />
        <KV k="Valid until" v={fmtDate(account.validity)} />

        <KV
          k="Minimum balance"
          v={<Money value={account.minBalance} />}
        />

        <KV
          k="Interest rate"
          v={`${account.interestRate}%`}
        />

        <KV
          k="Primary account"
          v={account.isPrimary ? 'Yes' : 'No'}
        />

        {account.closedDate && (
          <KV k="Closed" v={fmtDate(account.closedDate)} />
        )}

        {account.customerName != null && (
          <KV
            k="Customer"
            v={`${account.customerName} (#${account.customerId})`}
          />
        )}
      </dl>

      <div className="flex flex-wrap gap-3">
        {can(user, 'FREEZE_ACCOUNT') && account.status === 'ACTIVE' && (
          <Button
            variant="secondary"
            disabled={inactive}
            onClick={() => choose('FREEZE')}
          >
            Freeze account
          </Button>
        )}

        {can(user, 'FREEZE_ACCOUNT') && account.status === 'FROZEN' && (
          <Button
            variant="secondary"
            disabled={inactive}
            onClick={() => choose('UNFREEZE')}
          >
            Unfreeze account
          </Button>
        )}

        {can(user, 'CLOSE_ACCOUNT') && account.status !== 'CLOSED' && (
          <Button
            variant="danger"
            disabled={inactive || !zero}
            onClick={() => choose('CLOSE')}
          >
            Close account
          </Button>
        )}
      </div>

      {can(user, 'CLOSE_ACCOUNT') &&
        account.status !== 'CLOSED' &&
        !zero && (
          <p className="text-sm text-ink-400">
            The balance must be zero before this account can be closed.
          </p>
        )}

      {can(user, 'VIEW_ALL_TRANSACTIONS') && (
        <History
          key={accountNumber}
          accountNumber={accountNumber}
        />
      )}

      <Modal
        open={!!target}
        onClose={closeModal}
        title={
          target === 'CLOSE'
            ? 'Close account?'
            : target === 'FREEZE'
              ? 'Freeze account?'
              : 'Unfreeze account?'
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-500">
            Account {accountNumber}
          </p>

          {target === 'CLOSE' && (
            <Alert tone="info">
              Closure is permanent. Active linked cards will be blocked.
              Active linked deposits or loans must be resolved first.
            </Alert>
          )}

          <Field label="Reason">
            <Textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              minLength={5}
              maxLength={255}
              required
              disabled={action.busy}
            />
          </Field>

          <Alert>{action.error}</Alert>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={action.busy}
              onClick={closeModal}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant={target === 'CLOSE' ? 'danger' : 'primary'}
              loading={action.busy}
              disabled={reason.trim().length < 5}
            >
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

const EMPTY = {
  q: '',
  status: '',
  typeId: '',
  branchIfsc: ''
};

export default function Accounts() {
  const { user } = useAuth();

  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const query = new URLSearchParams({
    ...filters,
    page: String(page)
  });

  const list = useApi(`/employee/accounts?${query}`);
  const options = useApi('/employee/accounts/filters');

  const set = (key, value) => {
    setDraft(previous => ({ ...previous, [key]: value }));
  };

  return (
    <div className="soft-in">
      <PageHeader
        title="Accounts"
        subtitle={
          user.scope === 'ALL_BRANCHES'
            ? 'Account management across all branches.'
            : `Accounts at ${user.branch.name}.`
        }
      />

      <Card className="space-y-4 p-6">
        <form
          onSubmit={event => {
            event.preventDefault();
            setFilters({ ...draft, q: draft.q.trim() });
            setPage(1);
            setSelected(null);
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={
                can(user, 'VIEW_PERSONAL_INFO')
                  ? 'Exact account number or customer name'
                  : 'Exact account number'
              }
            >
              <Input
                value={draft.q}
                onChange={event => set('q', event.target.value)}
                maxLength={100}
              />
            </Field>

            <Field label="Status">
              <Select
                value={draft.status}
                onChange={event => set('status', event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="FROZEN">Frozen</option>
                <option value="CLOSED">Closed</option>
              </Select>
            </Field>

            <Field label="Account type">
              <Select
                value={draft.typeId}
                onChange={event => set('typeId', event.target.value)}
              >
                <option value="">All types</option>

                {options.data?.types.map(type => (
                  <option key={type.typeId} value={type.typeId}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>

            {user.scope === 'ALL_BRANCHES' && (
              <Field label="Branch">
                <Select
                  value={draft.branchIfsc}
                  onChange={event =>
                    set('branchIfsc', event.target.value)
                  }
                >
                  <option value="">All branches</option>

                  {options.data?.branches.map(branch => (
                    <option
                      key={branch.ifscCode}
                      value={branch.ifscCode}
                    >
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit">Search</Button>

            <Button
              type="button"
              variant="secondary"
              onClick={list.reload}
            >
              Refresh
            </Button>
          </div>
        </form>

        {options.error && (
          <ErrorNote onRetry={options.reload}>
            {options.error}
          </ErrorNote>
        )}

        {list.loading && <Loading />}

        {list.error && (
          <ErrorNote onRetry={list.reload}>
            {list.error}
          </ErrorNote>
        )}

        {!list.loading && list.data?.total === 0 && (
          <p className="text-sm text-ink-400">
            No matching accounts in your scope.
          </p>
        )}

        {!list.loading && list.data?.accounts.map(account => (
          <button
            type="button"
            key={account.accountNumber}
            onClick={() => setSelected(account.accountNumber)}
            className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4 text-left hover:bg-violet-50"
          >
            <span>
              <span className="font-medium tnum">
                {account.accountNumber} · {account.accountType}
              </span>

              <span className="block text-sm text-ink-400">
                {account.branchName}
                {account.customerName != null
                  ? ` · ${account.customerName}`
                  : ''}
              </span>
            </span>

            <span className="flex flex-wrap items-center gap-2">
              <Money value={account.balance} />

              {account.isPrimary && (
                <Badge tone="violet">Primary</Badge>
              )}

              <StatusBadge status={account.status} />
            </span>
          </button>
        ))}

        {list.data && (
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1 || list.loading}
              onClick={() => {
                setPage(page - 1);
                setSelected(null);
              }}
            >
              Previous
            </Button>

            <span className="text-sm">
              Page {page} · {list.data.total} accounts
            </span>

            <Button
              variant="secondary"
              disabled={page >= list.data.totalPages || list.loading}
              onClick={() => {
                setPage(page + 1);
                setSelected(null);
              }}
            >
              Next
            </Button>
          </div>
        )}
      </Card>

      {selected && (
        <AccountDetails
          key={selected}
          accountNumber={selected}
          onChanged={list.reload}
        />
      )}
    </div>
  );
}