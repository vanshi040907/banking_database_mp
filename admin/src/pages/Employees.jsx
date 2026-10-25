import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';
import { Alert, Button, Card, EmptyState, ErrorNote, Field, Input, KV, Loading, Modal, PageHeader, Select, StatusBadge, Table, useAction, useToast } from '@shared/ui.jsx';
import { fmtDate, fmtDateTime, titleCase } from '@shared/format.js';

function Create({ onClose, onDone }) {
  const { user } = useAuth();
  const { data: lk } = useApi('/staff/lookups');
  const [f, setF] = useState({ gender: 'F', branch_ifsc: user.branch_ifsc, role_id: '' });
  const on = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const act = useAction();
  const submit = (e) => { e.preventDefault(); act.run(async () => onDone(await api('/staff/employees', { method: 'POST', body: f }), f)); };
  return (
    <Modal open onClose={onClose} title="Add a staff member" width={620}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2"><Input value={f.emp_name ?? ''} onChange={on('emp_name')} required autoFocus /></Field>
        <Field label="Role"><Select value={f.role_id} onChange={on('role_id')} required><option value="">Choose…</option>{lk?.roles.map((r) => <option key={r.role_id} value={r.role_id}>{titleCase(r.role_name)}</option>)}</Select></Field>
        <Field label="Branch"><Select value={f.branch_ifsc} onChange={on('branch_ifsc')}>{lk?.branches.map((b) => <option key={b.ifsc_code} value={b.ifsc_code}>{b.branch_name}</option>)}</Select></Field>
        <Field label="Job title"><Input value={f.designation ?? ''} onChange={on('designation')} required /></Field>
        <Field label="Monthly salary (₹)"><Input value={f.salary ?? ''} onChange={(e) => setF({ ...f, salary: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" required /></Field>
        <Field label="Date of birth"><Input type="date" value={f.dob ?? ''} onChange={on('dob')} required /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={on('gender')}><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></Select></Field>
        <Field label="Mobile"><Input value={f.phone ?? ''} onChange={on('phone')} required /></Field>
        <Field label="Email"><Input type="email" value={f.email ?? ''} onChange={on('email')} required /></Field>
        <div className="sm:col-span-2"><Alert>{act.error}</Alert></div>
        <div className="flex justify-end gap-2.5 sm:col-span-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={act.busy}>Create</Button></div>
      </form>
    </Modal>
  );
}

function Panel({ emp, onClose, onChanged }) {
  const { can, user } = useAuth();
  const toast = useToast();
  const { data: lk } = useApi('/staff/lookups');
  const [role, setRole] = useState(String(emp.role_id));
  const [status, setStatus] = useState(emp.status);
  const [temp, setTemp] = useState(null);
  const act = useAction();
  const manage = can('MANAGE_EMPLOYEES');
  const self = emp.emp_id === user.emp_id;
  const save = (body, msg) => act.run(async () => { const r = await api(`/staff/employees/${emp.emp_id}`, { method: 'PATCH', body }); toast(msg); onChanged(); if (r.temp_password) setTemp(r.temp_password); });
  return (
    <Modal open side onClose={onClose} title={emp.emp_name} width={520}>
      <div className="space-y-6">
        <dl className="rounded-lg border border-line px-4">
          <KV k="Employee ID" v={<span className="tnum">{emp.emp_id}</span>} /><KV k="Job title" v={emp.designation} /><KV k="Branch" v={emp.branch_name} />
          <KV k="Email" v={emp.email ?? '—'} /><KV k="Joined" v={fmtDate(emp.join_date)} /><KV k="Last sign-in" v={emp.last_login ? fmtDateTime(emp.last_login) : 'Never'} />
        </dl>
        {manage && !self && (
          <div className="space-y-4">
            <Field label="Role"><div className="flex gap-2.5"><Select value={role} onChange={(e) => setRole(e.target.value)}>{lk?.roles.map((r) => <option key={r.role_id} value={r.role_id}>{titleCase(r.role_name)}</option>)}</Select>
              <Button variant="secondary" disabled={role === String(emp.role_id)} loading={act.busy} onClick={() => save({ role_id: role }, 'Role updated')}>Save</Button></div></Field>
            <Field label="Status"><div className="flex gap-2.5"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="INACTIVE">Inactive</option></Select>
              <Button variant="secondary" disabled={status === emp.status} loading={act.busy} onClick={() => save({ status }, 'Status updated')}>Save</Button></div></Field>
            <Button variant="danger" size="sm" onClick={() => save({ reset_password: true }, 'Temporary password issued')}>Reset password</Button>
            <Alert>{act.error}</Alert>
          </div>
        )}
        {manage && self && <Alert tone="info">You cannot change your own role or status.</Alert>}
        {temp && <Alert tone="ok">New temporary password: <span className="tnum font-semibold select-all">{temp}</span> (shown once)</Alert>}
      </div>
    </Modal>
  );
}

export default function Employees() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/staff/employees');
  const [sel, setSel] = useState(null);
  const [create, setCreate] = useState(false);
  const [pw, setPw] = useState(null);
  const current = data?.find((e) => e.emp_id === sel);
  return (
    <div className="soft-in">
      <PageHeader title="Staff" subtitle="People, roles and access." actions={can('MANAGE_EMPLOYEES') && <Button onClick={() => setCreate(true)}>Add staff member</Button>} />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      <Card>
        {loading && !data ? <Loading /> : (
          <Table rowKey="emp_id" rows={data} onRowClick={(r) => setSel(r.emp_id)} empty={<EmptyState title="No staff" />} columns={[
            { key: 'emp_id', label: 'ID', render: (r) => <span className="tnum text-ink-400">{r.emp_id}</span> },
            { key: 'emp_name', label: 'Name', render: (r) => <span className="font-medium">{r.emp_name}</span> },
            { key: 'role_name', label: 'Role', render: (r) => titleCase(r.role_name) },
            { key: 'branch_name', label: 'Branch' },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]} />
        )}
      </Card>
      {current && <Panel key={current.emp_id + current.status + current.role_id} emp={current} onClose={() => setSel(null)} onChanged={reload} />}
      {create && <Create onClose={() => setCreate(false)} onDone={(r, f) => { setCreate(false); reload(); toast(`${f.emp_name} added`); setPw({ id: r.emp_id, password: r.temp_password, name: f.emp_name }); }} />}
      {pw && (
        <Modal open onClose={() => setPw(null)} title="Staff member created" width={460}>
          <p className="mb-4 text-ink-500">{pw.name} signs in with employee ID <span className="tnum font-semibold">{pw.id}</span> and this temporary password:</p>
          <div className="serif tnum select-all rounded-lg border border-violet-200 bg-violet-50 px-5 py-4 text-center text-[28px] text-ink-900">{pw.password}</div>
          <p className="mt-3 text-[13px] text-ink-400">Shown once. They will be asked to change it.</p>
          <div className="mt-5 text-right"><Button onClick={() => setPw(null)}>Done</Button></div>
        </Modal>
      )}
    </div>
  );
}
