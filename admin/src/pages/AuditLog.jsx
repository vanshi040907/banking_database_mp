import { useState } from 'react';
import { useAuth } from '@shared/auth.jsx';
import { useApi } from '@shared/api.js';

import {
  Alert, Badge, Button, Card, ErrorNote,
  Field, Input, Loading, PageHeader, Select
} from '@shared/ui.jsx';

const EMPTY = {
  action: '',
  table: '',
  recordId: '',
  employeeId: '',
  fromDate: '',
  toDate: '',
  branchIfsc: '',
  scope: ''
};

function display(value) {
  if (value == null || value === '') return '—';

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default function AuditLog() {
  const { user } = useAuth();

  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);

  const options = useApi('/employee/audit/filters');

  const query = new URLSearchParams({
    ...filters,
    page: String(page)
  });

  const list = useApi(`/employee/audit?${query}`);

  const set = (key, value) => {
    setDraft(previous => ({ ...previous, [key]: value }));
  };

  const input = (
    key,
    label,
    maxLength,
    type = 'text'
  ) => (
    <Field label={label}>
      <Input
        type={type}
        value={draft[key]}
        onChange={event => set(key, event.target.value)}
        maxLength={maxLength}
      />
    </Field>
  );

  const select = (key, label, values) => (
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

  function refresh() {
    list.reload();
    options.reload();
  }

  return (
    <div className="soft-in">
      <PageHeader
        title="Audit log"
        subtitle={
          user.scope === 'ALL_BRANCHES'
            ? 'Recorded actions across branches, including legacy/unscoped entries.'
            : `Recorded actions attributed to ${user.branch.name}.`
        }
      />

      <Alert tone="info" className="mb-5">
        Older entries without a branch snapshot are available to Admin.
        Some cross-branch or staff-private details are restricted by permission.
      </Alert>

      <Card className="space-y-5 p-6">
        <form
          onSubmit={event => {
            event.preventDefault();

            setFilters({
              ...draft,
              recordId: draft.recordId.trim(),
              employeeId: draft.employeeId.trim()
            });

            setPage(1);
            list.reload();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {select(
              'action', 'Action', options.data?.actions ?? []
            )}

            {select(
              'table', 'Record type', options.data?.tables ?? []
            )}

            {input('recordId', 'Exact record ID', 40)}
            {input('employeeId', 'Employee actor ID', 10)}
            {input('fromDate', 'From date', 10, 'date')}

            {input(
              'toDate', 'To date (inclusive)', 10, 'date'
            )}

            {user.scope === 'ALL_BRANCHES' && (
              <>
                <Field label="Branch">
                  <Select
                    value={draft.branchIfsc}
                    onChange={event =>
                      set('branchIfsc', event.target.value)
                    }
                  >
                    <option value="">
                      All branches / unscoped
                    </option>

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

                <Field label="Branch attribution">
                  <Select
                    value={draft.scope}
                    onChange={event =>
                      set('scope', event.target.value)
                    }
                  >
                    <option value="">All entries</option>
                    <option value="SCOPED">Branch recorded</option>
                    <option value="UNSCOPED">Legacy / unscoped</option>
                  </Select>
                </Field>
              </>
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
                refresh();
              }}
            >
              Reset
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={refresh}
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
            No matching audit entries in your scope.
          </p>
        )}

        {!list.loading && list.data?.entries.map(entry => (
          <div
            key={entry.logId}
            className="space-y-3 rounded-lg border border-line p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  #{entry.logId} · {entry.action}
                </p>

                <p className="text-sm text-ink-400">
                  {entry.date}
                </p>
              </div>

              <Badge>
                {entry.scopeRecorded
                  ? 'Branch recorded'
                  : 'Legacy / unscoped'}
              </Badge>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                Record: {entry.table} · {entry.recordId}
              </p>

              <p>
                Actor:{' '}
                {entry.employeeId == null
                  ? 'Not recorded'
                  : `${entry.actorName ?? 'Employee'} (#${entry.employeeId})`}
              </p>

              <p>
                Branches: {entry.branches.join(', ') || 'Not recorded'}
              </p>
            </div>

            {entry.detailsVisible ? (
              <details className="rounded-lg bg-violet-50 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  View changes and reason
                </summary>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-sm text-ink-400">
                      Before
                    </p>

                    <pre className="whitespace-pre-wrap break-words text-sm">
                      {display(entry.oldValue)}
                    </pre>
                  </div>

                  <div>
                    <p className="mb-1 text-sm text-ink-400">
                      After
                    </p>

                    <pre className="whitespace-pre-wrap break-words text-sm">
                      {display(entry.newValue)}
                    </pre>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                  Reason/details: {entry.details || '—'}
                </p>
              </details>
            ) : (
              <p className="text-sm text-ink-400">
                Change details are restricted by permission or branch scope.
              </p>
            )}
          </div>
        ))}

        {list.data?.refineFilters && (
          <Alert tone="info">
            Narrow the filters to inspect more than 20,000 matches.
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
              {' '}· {list.data.total} entries
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