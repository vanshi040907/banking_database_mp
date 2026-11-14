import { useState } from 'react';

import { api, useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';

import {
  Alert, Badge, Button, Card, ErrorNote, Field,
  Input, KV, Loading, Modal, Money, PageHeader,
  Select, StatusBadge, Textarea, useAction
} from '@shared/ui.jsx';

import { can } from '../access.js';

function StaffForm({
  employee,
  options,
  busy,
  error,
  onSave
}) {
  const { user } = useAuth();
  const creating = !employee;

  const [form, setForm] = useState({
    name: '',
    designation: '',
    dob: '',
    gender: '',
    salary: '',
    phone: '',
    email: '',

    joinDate: new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata'
    }),

    roleId: employee ? String(employee.roleId) : '',
    branchIfsc: employee?.branchIfsc ?? '',
    status: employee?.status ?? 'ACTIVE',
    assignBranchManager: employee?.isBranchManager ?? false,
    reason: ''
  });

  const set = (key, value) => {
    setForm(previous => ({
      ...previous,
      [key]: value,

      ...(
        ['roleId', 'branchIfsc', 'status'].includes(key)
          ? { assignBranchManager: false }
          : {}
      )
    }));
  };

  const role = options.roles.find(
    item => String(item.roleId) === form.roleId
  );

  const branch = options.branches.find(
    item => item.ifscCode === form.branchIfsc
  );

  const roles = options.roles.filter(
    item => user.role === 'ADMIN' || item.name !== 'ADMIN'
  );

  const input = (
    key,
    label,
    maxLength,
    type = 'text',
    required = true
  ) => (
    <Field label={label}>
      <Input
        type={type}
        value={form[key]}
        onChange={event => set(key, event.target.value)}
        maxLength={maxLength}
        required={required}
        disabled={busy}
      />
    </Field>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();

        onSave({
          ...form,
          expectedBranchManagerId: branch?.managerId ?? null,

          ...(employee ? {
            expected: {
              roleId: employee.roleId,
              branchIfsc: employee.branchIfsc,
              status: employee.status,
              isBranchManager: employee.isBranchManager
            }
          } : {})
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {creating && (
          <>
            {input('name', 'Full name', 100)}
            {input('designation', 'Designation', 50)}
            {input('dob', 'Date of birth', 10, 'date')}
            {input('joinDate', 'Joining date', 10, 'date')}

            <Field label="Gender">
              <Select
                value={form.gender}
                onChange={event => set('gender', event.target.value)}
                required
                disabled={busy}
              >
                <option value="">Select</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </Select>
            </Field>

            {input('salary', 'Salary', 13)}

            {input(
              'phone',
              'Phone (e.g. +919876543210)',
              15,
              'tel'
            )}

            {input(
              'email',
              'Email (optional)',
              120,
              'email',
              false
            )}
          </>
        )}

        <Field label="Role">
          <Select
            value={form.roleId}
            onChange={event => set('roleId', event.target.value)}
            required
            disabled={busy}
          >
            <option value="">Select role</option>

            {roles.map(item => (
              <option key={item.roleId} value={item.roleId}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Branch">
          <Select
            value={form.branchIfsc}
            onChange={event => set('branchIfsc', event.target.value)}
            required
            disabled={busy}
          >
            <option value="">Select branch</option>

            {options.branches
              .filter(item => !creating || item.status === 'ACTIVE')
              .map(item => (
                <option key={item.ifscCode} value={item.ifscCode}>
                  {item.name} ({item.status})
                </option>
              ))}
          </Select>
        </Field>

        {!creating && (
          <Field label="Employee status">
            <Select
              value={form.status}
              onChange={event => set('status', event.target.value)}
              disabled={busy}
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
        )}
      </div>

      {role?.name === 'MANAGER' && form.status === 'ACTIVE' && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.assignBranchManager}
            onChange={event =>
              set('assignBranchManager', event.target.checked)
            }
            disabled={busy}
          />

          <span>
            Assign as the designated manager of this branch.
            This replaces its current designated manager
            {branch?.managerId ? ` (#${branch.managerId})` : ''}.
          </span>
        </label>
      )}

      <Field label="Reason">
        <Textarea
          value={form.reason}
          onChange={event => set('reason', event.target.value)}
          minLength={5}
          maxLength={255}
          required
          disabled={busy}
        />
      </Field>

      <Alert>{error}</Alert>

      <Button
        type="submit"
        loading={busy}
        disabled={form.reason.trim().length < 5}
      >
        {creating ? 'Create employee' : 'Save access changes'}
      </Button>
    </form>
  );
}

function StaffDetails({ employeeId, options, onChanged }) {
  const { user } = useAuth();
  const state = useApi(`/employee/staff/${employeeId}`);

  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const action = useAction();
  const employee = state.data?.employee;

  if (state.error) {
    return (
      <ErrorNote onRetry={state.reload}>
        {state.error}
      </ErrorNote>
    );
  }

  if (!employee) return <Loading />;

  const manageable =
    can(user, 'MANAGE_EMPLOYEES') &&
    employee.employeeId !== user.id &&
    (user.role === 'ADMIN' || employee.role !== 'ADMIN');

  function save(form) {
    if (action.busy) return;

    action.run(async () => {
      const result = await api(
        `/employee/staff/${employeeId}/access`,
        { method: 'PATCH', body: form }
      );

      setMessage(result.message);
      setEditing(false);
      state.reload();
      onChanged();
      options.reload();
    });
  }

  return (
    <Card className="mt-6 space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[24px]">
          {employee.name} · E{employee.employeeId}
        </h2>

        <Button
          size="sm"
          variant="secondary"
          onClick={state.reload}
        >
          Refresh details
        </Button>
      </div>

      {message && <Alert tone="ok">{message}</Alert>}

      <dl className="grid gap-x-8 sm:grid-cols-2">
        <KV k="Role" v={employee.role} />
        <KV k="Designation" v={employee.designation} />

        <KV
          k="Branch"
          v={`${employee.branchName} (${employee.branchIfsc})`}
        />

        <KV
          k="Status"
          v={<StatusBadge status={employee.status} />}
        />

        <KV k="Joined" v={employee.joinDate} />

        <KV
          k="Designated branch manager"
          v={employee.isBranchManager ? 'Yes' : 'No'}
        />

        {employee.salary !== undefined && (
          <>
            <KV k="Date of birth" v={employee.dob} />
            <KV k="Gender" v={employee.gender} />

            <KV
              k="Salary"
              v={<Money value={employee.salary} />}
            />

            <KV
              k="Phones"
              v={employee.phones.join(', ') || '—'}
            />

            <KV
              k="Emails"
              v={employee.emails.join(', ') || '—'}
            />

            <KV
              k="Password change required"
              v={employee.mustChangePassword ? 'Yes' : 'No'}
            />

            <KV
              k="Last login"
              v={
                employee.lastLogin
                  ? new Date(employee.lastLogin).toLocaleString('en-IN')
                  : 'Never'
              }
            />
          </>
        )}
      </dl>

      {manageable && (
        <Button
          variant="secondary"
          disabled={!options.data || state.loading}
          onClick={() => {
            action.setError('');
            setEditing(true);
          }}
        >
          Change role, branch or status
        </Button>
      )}

      {can(user, 'MANAGE_EMPLOYEES') &&
        employee.employeeId === user.id && (
          <Alert tone="info">
            You cannot change your own access.
            Use Security to change your password.
          </Alert>
        )}

      <Modal
        open={editing}
        onClose={() => {
          if (!action.busy) setEditing(false);
        }}
        title="Change employee access"
        width={700}
      >
        {editing && options.data && (
          <StaffForm
            employee={employee}
            options={options.data}
            busy={action.busy}
            error={action.error}
            onSave={save}
          />
        )}

        {editing && action.error && (
          <Button
            variant="ghost"
            disabled={action.busy}
            onClick={() => {
              setEditing(false);
              state.reload();
              options.reload();
            }}
          >
            Close and refresh details/options
          </Button>
        )}
      </Modal>
    </Card>
  );
}

const EMPTY = {
  q: '',
  roleId: '',
  branchIfsc: '',
  status: ''
};

export default function Staff() {
  const { user } = useAuth();

  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  const options = useApi('/employee/staff/options');

  const query = new URLSearchParams({
    ...filters,
    page: String(page)
  });

  const list = useApi(`/employee/staff?${query}`);
  const action = useAction();

  const set = (key, value) => {
    setDraft(previous => ({ ...previous, [key]: value }));
  };

  function create(form) {
    if (action.busy) return;

    action.run(async () => {
      const result = await api('/employee/staff', {
        method: 'POST',
        body: form
      });

      setCreated(result);
      setSelected(result.employeeId);
      setCreating(false);
      list.reload();
      options.reload();
    });
  }

  return (
    <div className="soft-in">
      <PageHeader
        title="Staff"
        subtitle={
          user.scope === 'ALL_BRANCHES'
            ? 'Employees and access across all branches.'
            : `Staff directory for ${user.branch.name}.`
        }
      />

      {created && (
        <Alert tone="info" className="mb-5">
          <p>
            Employee ID: <strong>{created.employeeId}</strong>
            {' '}· Temporary password:{' '}
            <strong>{created.temporaryPassword}</strong>
          </p>

          <p>
            Provide these securely to the employee.
            First login requires OTP verification and a password change.
            This password cannot be retrieved after dismissal.
          </p>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCreated(null)}
          >
            Dismiss password
          </Button>
        </Alert>
      )}

      <Card className="space-y-4 p-6">
        <form
          onSubmit={event => {
            event.preventDefault();
            setFilters({ ...draft, q: draft.q.trim() });
            setPage(1);
            setSelected(null);
            list.reload();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name or employee ID">
              <Input
                value={draft.q}
                onChange={event => set('q', event.target.value)}
                maxLength={100}
              />
            </Field>

            <Field label="Role">
              <Select
                value={draft.roleId}
                onChange={event => set('roleId', event.target.value)}
              >
                <option value="">All roles</option>

                {options.data?.roles.map(role => (
                  <option key={role.roleId} value={role.roleId}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Status">
              <Select
                value={draft.status}
                onChange={event => set('status', event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="INACTIVE">Inactive</option>
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

          <div className="flex flex-wrap gap-2">
            <Button type="submit">Search</Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                list.reload();
                options.reload();
              }}
            >
              Refresh
            </Button>

            {can(user, 'MANAGE_EMPLOYEES') && (
              <Button
                type="button"
                disabled={!options.data}
                onClick={() => {
                  action.setError('');
                  setCreating(true);
                }}
              >
                Create employee
              </Button>
            )}
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
            No matching employees.
          </p>
        )}

        {!list.loading && list.data?.employees.map(employee => (
          <button
            type="button"
            key={employee.employeeId}
            onClick={() => setSelected(employee.employeeId)}
            className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4 text-left hover:bg-violet-50"
          >
            <span>
              {employee.name} · E{employee.employeeId}

              <span className="block text-sm text-ink-400">
                {employee.role} · {employee.branchName}
              </span>
            </span>

            <span className="flex gap-2">
              {employee.isBranchManager && (
                <Badge tone="violet">Branch manager</Badge>
              )}

              <StatusBadge status={employee.status} />
            </span>
          </button>
        ))}

        {list.data?.refineFilters && (
          <Alert tone="info">
            Refine your filters to inspect more than 20,000 matches.
          </Alert>
        )}

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
              Page {page} · {list.data.total} employees
            </span>

            <Button
              variant="secondary"
              disabled={
                page >= list.data.totalPages ||
                list.loading
              }
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
        <StaffDetails
          key={selected}
          employeeId={selected}
          options={options}
          onChanged={list.reload}
        />
      )}

      <Modal
        open={creating}
        onClose={() => {
          if (!action.busy) setCreating(false);
        }}
        title="Create employee"
        width={760}
      >
        {creating && options.data && (
          <StaffForm
            options={options.data}
            busy={action.busy}
            error={action.error}
            onSave={create}
          />
        )}

        {creating && action.error && (
          <Button
            variant="ghost"
            disabled={action.busy}
            onClick={options.reload}
          >
            Refresh branch/role options
          </Button>
        )}
      </Modal>
    </div>
  );
}