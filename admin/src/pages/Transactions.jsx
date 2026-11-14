import { useState } from 'react';
import { useAuth } from '@shared/auth.jsx';
import { useApi } from '@shared/api.js';

import {
  Alert, Button, Card, ErrorNote, Field, Input,
  Loading, Money, PageHeader, Select, StatusBadge
} from '@shared/ui.jsx';

const EMPTY = {
  accountNumber: '',
  reference: '',
  type: '',
  mode: '',
  status: '',
  fromDate: '',
  toDate: '',
  minAmount: '',
  maxAmount: '',
  branchIfsc: ''
};

export default function Transactions() {
  const { user } = useAuth();

  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);

  const options = useApi('/employee/transactions/filters');

  const query = new URLSearchParams({
    ...filters,
    page: String(page)
  });

  const list = useApi(`/employee/transactions?${query}`);

  const set = (key, value) => {
    setDraft(previous => ({ ...previous, [key]: value }));
  };

  function input(
    key,
    label,
    type = 'text',
    maxLength = 100
  ) {
    return (
      <Field label={label}>
        <Input
          type={type}
          value={draft[key]}
          onChange={event => set(key, event.target.value)}
          maxLength={maxLength}
        />
      </Field>
    );
  }

  function select(key, label, values) {
    return (
      <Field label={label}>
        <Select
          value={draft[key]}
          onChange={event => set(key, event.target.value)}
        >
          <option value="">All</option>

          {values.map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  return (
    <div className="soft-in">
      <PageHeader
        title="Transactions"
        subtitle={
          user.scope === 'ALL_BRANCHES'
            ? 'Ledger transactions across all branches.'
            : `Transactions involving an account at ${user.branch.name}.`
        }
      />

      <Card className="space-y-5 p-6">
        <form
          onSubmit={event => {
            event.preventDefault();

            setFilters({
              ...draft,
              accountNumber: draft.accountNumber.trim(),
              reference: draft.reference.trim()
            });

            setPage(1);
            list.reload();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {input(
              'accountNumber',
              'Exact account number',
              'text',
              20
            )}

            {input(
              'reference',
              'Full reference UUID',
              'text',
              36
            )}

            {select('type', 'Transaction type', [
              'DEPOSIT',
              'WITHDRAWAL',
              'TRANSFER'
            ])}

            {select(
              'mode',
              'Mode',
              options.data?.modes ?? []
            )}

            {select('status', 'Status', [
              'SUCCESS',
              'PENDING',
              'FAILED'
            ])}

            {input('fromDate', 'From date', 'date', 10)}

            {input(
              'toDate',
              'To date (inclusive)',
              'date',
              10
            )}

            {input(
              'minAmount',
              'Minimum amount',
              'text',
              16
            )}

            {input(
              'maxAmount',
              'Maximum amount',
              'text',
              16
            )}

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

          <div className="flex flex-wrap gap-2">
            <Button type="submit">Apply filters</Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft(EMPTY);
                setFilters(EMPTY);
                setPage(1);
                list.reload();
              }}
            >
              Reset
            </Button>

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
            No matching transactions in your scope.
          </p>
        )}

        {!list.loading && list.data?.transactions.map(transaction => (
          <div
            key={transaction.transactionId}
            className="space-y-3 rounded-lg border border-line p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  #{transaction.transactionId}
                  {' '}· {transaction.type}
                  {' '}· {transaction.mode}
                </p>

                <p className="text-sm text-ink-400">
                  {transaction.date}
                </p>
              </div>

              <span className="flex items-center gap-3">
                <Money value={transaction.amount} />
                <StatusBadge status={transaction.status} />
              </span>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-ink-400">From</p>

                <p className="tnum">
                  {transaction.fromAccount ?? 'Cash counter'}
                </p>

                {transaction.fromBranch && (
                  <p className="text-ink-400">
                    {transaction.fromBranch}
                  </p>
                )}

                {transaction.fromCustomerName && (
                  <p>{transaction.fromCustomerName}</p>
                )}
              </div>

              <div>
                <p className="text-ink-400">To</p>

                <p className="tnum">
                  {transaction.toAccount ?? 'Cash counter'}
                </p>

                {transaction.toBranch && (
                  <p className="text-ink-400">
                    {transaction.toBranch}
                  </p>
                )}

                {transaction.toCustomerName && (
                  <p>{transaction.toCustomerName}</p>
                )}
              </div>
            </div>

            <p className="break-all text-xs text-ink-400">
              Reference: {transaction.referenceNumber}
            </p>

            {transaction.remarks && (
              <p className="text-sm">
                Remarks: {transaction.remarks}
              </p>
            )}
          </div>
        ))}

        {list.data?.refineFilters && (
          <Alert tone="info">
            More than 20,000 transactions match. Narrow the
            date range or other filters to inspect all results.
          </Alert>
        )}

        {list.data && (
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1 || list.loading}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>

            <span className="text-sm">
              Page {page} of {Math.max(1, list.data.totalPages)}
              {' '}· {list.data.total} matches
            </span>

            <Button
              variant="secondary"
              disabled={
                page >= list.data.totalPages ||
                list.loading
              }
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}