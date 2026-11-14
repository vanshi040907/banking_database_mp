import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';
import CustomerAccounts from './CustomerAccounts.jsx';

import {
  Alert, Button, Card, ErrorNote, Field, Input, KV,
  Loading, Modal, PageHeader, Select, StatusBadge,
  useAction, useToast
} from '@shared/ui.jsx';

import { can } from '../access.js';

const EMPTY = {
  name: '',
  dob: '',
  gender: '',
  addressLine: '',
  pincode: '',
  city: '',
  state: '',
  phone: '',
  email: '',
  proofType: 'AADHAAR',
  proofNo: '',
  panNo: '',
  kycStatus: 'PENDING',
  registrationBranchIfsc: ''
};

function CustomerForm({
  initial,
  registration = false,
  branches = [],
  busy,
  error,
  onSave
}) {
  const [form, setForm] = useState({
    ...EMPTY,
    ...initial
  });

  const set = (key, value) => {
    setForm(previous => ({ ...previous, [key]: value }));
  };

  const input = (
    key,
    label,
    maxLength,
    type = 'text',
    required = true
  ) => (
    <Field key={key} label={label}>
      <Input
        type={type}
        value={form[key] ?? ''}
        onChange={event => set(key, event.target.value)}
        maxLength={maxLength}
        required={required}
        disabled={busy}
      />
    </Field>
  );

  const select = (key, label, options) => (
    <Field label={label}>
      <Select
        value={form[key]}
        onChange={event => set(key, event.target.value)}
        required
        disabled={busy}
      >
        <option value="">Select</option>

        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();
        onSave(form);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {registration && (
          <>
            {input('name', 'Full name', 100)}
            {input('dob', 'Date of birth', 10, 'date')}

            {select('gender', 'Gender', [
              ['M', 'Male'],
              ['F', 'Female'],
              ['O', 'Other']
            ])}

            {select(
              'registrationBranchIfsc',
              'Registration branch',
              branches.map(branch => [
                branch.ifscCode,
                `${branch.name} (${branch.ifscCode})`
              ])
            )}

            {select('proofType', 'Identity document type', [
              ['AADHAAR', 'Aadhaar'],
              ['PASSPORT', 'Passport'],
              ['VOTER_ID', 'Voter ID'],
              ['DRIVING_LICENSE', 'Driving licence']
            ])}

            {input('proofNo', 'Identity document number', 30)}

            {input(
              'panNo', 'PAN (optional)', 10, 'text', false
            )}

            {select('kycStatus', 'KYC status', [
              ['PENDING', 'Pending verification'],
              ['VERIFIED', 'Documents verified']
            ])}
          </>
        )}

        {input('addressLine', 'Address', 255)}
        {input('pincode', 'Pincode', 6)}
        {input('city', 'City', 60)}
        {input('state', 'State', 60)}

        {input(
          'phone',
          'Primary phone (e.g. +919876543210)',
          15,
          'tel'
        )}

        {input(
          'email',
          'Primary email (optional)',
          120,
          'email',
          false
        )}
      </div>

      <Alert>{error}</Alert>

      <Button type="submit" loading={busy}>
        {registration ? 'Register customer' : 'Save contacts'}
      </Button>
    </form>
  );
}

function CustomerDetails({ customerId }) {
  const { user } = useAuth();

  const state = useApi(`/employee/customers/${customerId}`);

  const [editing, setEditing] = useState(false);
  const [kyc, setKyc] = useState('VERIFIED');
  const [note, setNote] = useState('');

  const action = useAction();
  const toast = useToast();
  const customer = state.data?.customer;

  if (state.error) {
    return (
      <ErrorNote onRetry={state.reload}>
        {state.error}
      </ErrorNote>
    );
  }

  if (!customer) return <Loading />;

  function saveContacts(form) {
    if (action.busy) return;

    action.run(async () => {
      const result = await api(
        `/employee/customers/${customerId}/contacts`,
        { method: 'PATCH', body: form }
      );

      toast(result.message);
      setEditing(false);
      state.reload();
    });
  }

  function saveKyc(event) {
    event.preventDefault();

    if (action.busy) return;

    action.run(async () => {
      const result = await api(
        `/employee/customers/${customerId}/kyc`,
        {
          method: 'PATCH',
          body: { status: kyc, note }
        }
      );

      toast(result.message);
      setNote('');
      state.reload();
    });
  }

  return (
    <Card className="mt-6 space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[24px]">
          {customer.name} · #{customer.customerId}
        </h2>

        <Button
          variant="secondary"
          size="sm"
          onClick={state.reload}
        >
          Refresh
        </Button>
      </div>

      <dl className="grid gap-x-8 sm:grid-cols-2">
        <KV k="Date of birth" v={customer.dob} />
        <KV k="Gender" v={customer.gender} />

        <KV
          k="Customer status"
          v={<StatusBadge status={customer.status} />}
        />

        <KV
          k="KYC"
          v={<StatusBadge status={customer.kycStatus} />}
        />

        <KV
          k="Registration branch"
          v={customer.registrationBranchIfsc ?? 'Not assigned'}
        />

        <KV k="Primary phone" v={customer.phone || '—'} />
        <KV k="Primary email" v={customer.email || '—'} />
        <KV k="Address" v={customer.addressLine} />

        <KV
          k="Location"
          v={`${customer.city}, ${customer.state} ${customer.pincode}`}
        />

        <KV
          k="Identity document"
          v={`${customer.proofType}: ${customer.proofNo}`}
        />

        <KV k="PAN" v={customer.panNo || '—'} />
      </dl>

      {can(user, 'EDIT_CUSTOMER_DETAILS') && (
        <Button
          variant="secondary"
          onClick={() => {
            action.setError('');
            setEditing(true);
          }}
        >
          Edit contacts
        </Button>
      )}

      {can(user, 'REGISTER_CUSTOMER') && (
        <form
          onSubmit={saveKyc}
          className="space-y-3 border-t border-line pt-4"
        >
          <h3 className="text-[19px]">Review KYC</h3>

          <Field label="New KYC status">
            <Select
              value={kyc}
              onChange={event => setKyc(event.target.value)}
              disabled={action.busy}
            >
              <option value="VERIFIED">Verified</option>
              <option value="PENDING">Pending</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </Field>

          <Field label="Review note">
            <Input
              value={note}
              onChange={event => setNote(event.target.value)}
              minLength={5}
              maxLength={255}
              required
              disabled={action.busy}
            />
          </Field>

          <Button
            type="submit"
            loading={action.busy}
            disabled={
              customer.kycStatus === kyc ||
              note.trim().length < 5
            }
          >
            Update KYC
          </Button>
        </form>
      )}

      {!editing && <Alert>{action.error}</Alert>}

      <CustomerAccounts
  key={customer.customerId}
  customer={customer}
/>

      <Modal
        open={editing}
        onClose={() => {
          if (!action.busy) setEditing(false);
        }}
        title="Edit customer contacts"
        width={720}
      >
        {editing && (
          <CustomerForm
            initial={customer}
            busy={action.busy}
            error={action.error}
            onSave={saveContacts}
          />
        )}
      </Modal>
    </Card>
  );
}

export default function Customers() {
  const { user } = useAuth();

  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [created, setCreated] = useState(null);

  const list = useApi(
    `/employee/customers?q=${encodeURIComponent(query)}&page=${page}`
  );

  const options = useApi('/employee/customer-options');
  const action = useAction();

  function register(form) {
    if (action.busy) return;

    action.run(async () => {
      const result = await api('/employee/customers', {
        method: 'POST',
        body: form
      });

      setCreated(result);
      setSelected(result.customerId);
      setRegistering(false);
      list.reload();
    });
  }

  return (
    <div className="soft-in">
      <PageHeader
        title="Customers"
        subtitle={
          user.scope === 'ALL_BRANCHES'
            ? 'Customer registration and profiles across branches.'
            : `Customers registered at ${user.branch.name} or holding an account there.`
        }
      />

      {created && (
        <Alert tone="info" className="mb-5">
          <p>
            Customer #{created.customerId} registered.
            Temporary password:{' '}
            <strong className="tnum">
              {created.temporaryPassword}
            </strong>
          </p>

          <p>
            Record it securely and provide it to the customer.
            It cannot be retrieved after this message is dismissed.
            Login becomes available after an account is opened;
            first login requires a password change.
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
            setPage(1);
            setQuery(term.trim());
            setSelected(null);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <Field
            label="Search by name, customer ID or phone"
            className="min-w-[240px] flex-1"
          >
            <Input
              value={term}
              onChange={event => setTerm(event.target.value)}
              maxLength={80}
            />
          </Field>

          <Button type="submit">Search</Button>

          <Button
            type="button"
            variant="secondary"
            onClick={list.reload}
          >
            Refresh
          </Button>

          {can(user, 'REGISTER_CUSTOMER') && (
            <Button
              type="button"
              onClick={() => {
                action.setError('');
                setRegistering(true);
              }}
            >
              Register customer
            </Button>
          )}
        </form>

        {list.loading && <Loading />}

        {list.error && (
          <ErrorNote onRetry={list.reload}>
            {list.error}
          </ErrorNote>
        )}

        {!list.loading && list.data?.customers.map(customer => (
          <button
            type="button"
            key={customer.customerId}
            onClick={() => setSelected(customer.customerId)}
            className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4 text-left hover:bg-violet-50"
          >
            <span>
              {customer.name} · #{customer.customerId}

              <span className="block text-sm text-ink-400">
                {customer.phone}
              </span>
            </span>

            <span className="flex gap-2">
              <StatusBadge status={customer.kycStatus} />
              <StatusBadge status={customer.status} />
            </span>
          </button>
        ))}

        {!list.loading && list.data?.total === 0 && (
          <p className="text-sm text-ink-400">
            No customers found in your scope.
          </p>
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
              Page {page} · {list.data.total} customers
            </span>

            <Button
              variant="secondary"
              disabled={
                page >= list.data.totalPages || list.loading
              }
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>

      {selected && (
        <CustomerDetails
          key={selected}
          customerId={selected}
        />
      )}

      <Modal
        open={registering}
        onClose={() => {
          if (!action.busy) setRegistering(false);
        }}
        title="Register customer"
        width={760}
      >
        {options.error ? (
          <ErrorNote onRetry={options.reload}>
            {options.error}
          </ErrorNote>
        ) : !options.data ? (
          <Loading />
        ) : registering && (
          <CustomerForm
            registration
            branches={options.data.branches}
            busy={action.busy}
            error={action.error}
            onSave={register}
          />
        )}
      </Modal>
    </div>
  );
}