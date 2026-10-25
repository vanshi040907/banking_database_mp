import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';
import { Alert, Badge, Button, Card, EmptyState, ErrorNote, Field, Input, KV, Loading, Modal, Money, PageHeader, Select, StatusBadge, Table, Textarea, useAction, useToast } from '@shared/ui.jsx';
import { fmtDate, groupAcc, titleCase } from '@shared/format.js';

const setter = (set) => (k) => (e) => set((f) => ({ ...f, [k]: e.target.value }));

function TempPassword({ info, onClose }) {
  return (
    <Modal open onClose={onClose} title={info.title} width={460}>
      <p className="mb-4 text-ink-500">{info.text}</p>
      <div className="serif tnum rounded-lg border border-violet-200 bg-violet-50 px-5 py-4 text-center text-[28px] tracking-wide text-ink-900 select-all">{info.password}</div>
      <p className="mt-3 text-[13px] text-ink-400">This is shown once. Share it with the person securely; they will be asked to change it.</p>
      <div className="mt-5 text-right"><Button onClick={onClose}>Done</Button></div>
    </Modal>
  );
}

function Register({ onClose, onDone }) {
  const { data: lk } = useApi('/staff/lookups');
  const [f, setF] = useState({ gender: 'F', id_proof_type: 'AADHAAR', pincode: '' });
  const on = setter(setF);
  const act = useAction();
  const submit = (e) => { e.preventDefault(); act.run(async () => onDone(await api('/staff/customers', { method: 'POST', body: f }), f)); };
  return (
    <Modal open onClose={onClose} title="Register a customer" width={640}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2"><Input value={f.name ?? ''} onChange={on('name')} required autoFocus /></Field>
        <Field label="Date of birth"><Input type="date" value={f.dob ?? ''} onChange={on('dob')} required /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={on('gender')}><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></Select></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address_line ?? ''} onChange={on('address_line')} required /></Field>
        <Field label="City / pincode"><Select value={f.pincode} onChange={on('pincode')} required><option value="">Choose…</option>{lk?.locations.map((l) => <option key={l.pincode} value={l.pincode}>{l.city} · {l.pincode}</option>)}</Select></Field>
        <Field label="Mobile"><Input value={f.phone ?? ''} onChange={on('phone')} placeholder="10 digits" required /></Field>
        <Field label="Email" className="sm:col-span-2"><Input type="email" value={f.email ?? ''} onChange={on('email')} required /></Field>
        <Field label="ID proof"><Select value={f.id_proof_type} onChange={on('id_proof_type')}><option value="AADHAAR">Aadhaar</option><option value="PASSPORT">Passport</option><option value="VOTER_ID">Voter ID</option><option value="DRIVING_LICENSE">Driving licence</option></Select></Field>
        <Field label="ID number"><Input value={f.id_proof_no ?? ''} onChange={on('id_proof_no')} required /></Field>
        <Field label="PAN (optional)" className="sm:col-span-2"><Input value={f.pan_no ?? ''} onChange={(e) => setF({ ...f, pan_no: e.target.value.toUpperCase() })} maxLength={10} /></Field>
        <div className="sm:col-span-2"><Alert tone="info">Registering confirms you have verified the customer's original documents.</Alert></div>
        <div className="sm:col-span-2"><Alert>{act.error}</Alert></div>
        <div className="flex justify-end gap-2.5 sm:col-span-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={act.busy}>Register</Button></div>
      </form>
    </Modal>
  );
}

function OpenAccount({ cust, onClose, onDone }) {
  const { user } = useAuth();
  const { data: lk } = useApi('/staff/lookups');
  const [f, setF] = useState({ type_id: '', branch_ifsc: user.branch_ifsc, opening: '' });
  const on = setter(setF);
  const act = useAction();
  const submit = (e) => { e.preventDefault(); act.run(async () => onDone(await api('/staff/accounts', { method: 'POST', body: { ...f, cust_id: cust.cust_id } }))); };
  const t = lk?.account_types.find((x) => String(x.type_id) === String(f.type_id));
  return (
    <Modal open onClose={onClose} title={`Open an account for ${cust.name}`} width={480}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Account type"><Select value={f.type_id} onChange={on('type_id')} required><option value="">Choose…</option>{lk?.account_types.map((x) => <option key={x.type_id} value={x.type_id}>{titleCase(x.type_name)}</option>)}</Select></Field>
        {user.all_branches && <Field label="Branch"><Select value={f.branch_ifsc} onChange={on('branch_ifsc')}>{lk?.branches.map((b) => <option key={b.ifsc_code} value={b.ifsc_code}>{b.branch_name}</option>)}</Select></Field>}
        <Field label="Opening deposit (cash)" hint={t ? `Minimum balance for this type: ₹${Number(t.min_balance).toLocaleString('en-IN')}` : undefined}>
          <Input value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder="0" /></Field>
        <Alert>{act.error}</Alert>
        <div className="flex justify-end gap-2.5"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={act.busy}>Open account</Button></div>
      </form>
    </Modal>
  );
}

function EditContact({ cust, onClose, onDone }) {
  const { data: lk } = useApi('/staff/lookups');
  const [f, setF] = useState({ address_line: cust.address_line, pincode: cust.pincode, phone: cust.phones.find((p) => p.is_primary)?.ph_no ?? '', email: cust.emails.find((e) => e.is_primary)?.mail ?? '' });
  const on = setter(setF);
  const act = useAction();
  const submit = (e) => { e.preventDefault(); act.run(async () => { await api(`/staff/customers/${cust.cust_id}`, { method: 'PATCH', body: f }); onDone(); }); };
  return (
    <Modal open onClose={onClose} title="Edit contact details" width={520}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Address"><Input value={f.address_line} onChange={on('address_line')} required /></Field>
        <Field label="City / pincode"><Select value={f.pincode} onChange={on('pincode')}>{lk?.locations.map((l) => <option key={l.pincode} value={l.pincode}>{l.city} · {l.pincode}</option>)}</Select></Field>
        <Field label="Mobile (receives OTPs)"><Input value={f.phone} onChange={on('phone')} required /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={on('email')} required /></Field>
        <Alert>{act.error}</Alert>
        <div className="flex justify-end gap-2.5"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={act.busy}>Save changes</Button></div>
      </form>
    </Modal>
  );
}

function Panel({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: c, error, reload } = useApi(`/staff/customers/${id}`);
  const [dlg, setDlg] = useState(null);
  const refresh = () => { reload(); onChanged(); };
  return (
    <Modal open side onClose={onClose} title={c?.name ?? 'Customer'} width={600}>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!c && !error && <Loading />}
      {c && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2"><StatusBadge status={c.kyc_status} /><Badge>Customer #{c.cust_id}</Badge>
            <div className="ml-auto flex gap-2">
              {can('EDIT_CUSTOMER_DETAILS') && <Button size="sm" variant="secondary" onClick={() => setDlg('edit')}>Edit contact</Button>}
              {can('OPEN_ACCOUNT') && <Button size="sm" onClick={() => setDlg('open')}>Open account</Button>}</div></div>
          <dl className="rounded-lg border border-line px-4">
            <KV k="Date of birth" v={fmtDate(c.dob)} /><KV k="Gender" v={{ M: 'Male', F: 'Female', O: 'Other' }[c.gender]} />
            <KV k="Address" v={<span className="block max-w-[260px]">{c.address_line}, {c.city}, {c.state} {c.pincode}</span>} />
            {c.phones.map((p) => <KV key={p.ph_no} k={p.is_primary ? 'Mobile (OTP)' : 'Mobile'} v={<span className="tnum">{p.ph_no}</span>} />)}
            {c.emails.map((e) => <KV key={e.mail} k="Email" v={e.mail} />)}
            <KV k="ID proof" v={titleCase(c.id_proof_type)} /><KV k="PAN" v={<span className="tnum">{c.pan_no ?? '—'}</span>} /><KV k="Registered" v={fmtDate(c.created)} />
          </dl>
          <section><h3 className="mb-2 text-[18px]">Accounts</h3>
            <div className="rounded-lg border border-line">
              <Table dense rowKey="acc_no" rows={c.accounts} empty={<EmptyState title="No accounts yet">Open the first account to get this customer started.</EmptyState>} columns={[
                { key: 'acc_no', label: 'Account', render: (r) => <span className="tnum font-medium">{groupAcc(r.acc_no)}</span> },
                { key: 'type_name', label: 'Type', render: (r) => titleCase(r.type_name) },
                { key: 'balance', label: 'Balance', align: 'right', render: (r) => <Money value={r.balance} /> },
                { key: 'status', label: '', render: (r) => <StatusBadge status={r.status} /> }]} /></div></section>
        </div>
      )}
      {dlg === 'edit' && <EditContact cust={c} onClose={() => setDlg(null)} onDone={() => { setDlg(null); toast('Contact details updated'); refresh(); }} />}
      {dlg === 'open' && <OpenAccount cust={c} onClose={() => setDlg(null)} onDone={(r) => { setDlg(null); toast(`Account ${groupAcc(r.acc_no)} opened`); refresh(); }} />}
    </Modal>
  );
}

export default function Customers() {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [reg, setReg] = useState(false);
  const [pw, setPw] = useState(null);
  const { data, error, loading, reload } = useApi(`/staff/customers?q=${encodeURIComponent(q)}`, []);
  return (
    <div className="soft-in">
      <PageHeader title="Customers" subtitle="Search by name, mobile number or customer ID."
        actions={can('REGISTER_CUSTOMER') && <Button onClick={() => setReg(true)}>Register customer</Button>} />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" className="mb-4 max-w-[360px]" />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      <Card>
        {loading && !data ? <Loading /> : (
          <Table rowKey="cust_id" rows={data} onRowClick={(r) => setSel(r.cust_id)} empty={<EmptyState title="No customers found" />} columns={[
            { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'phone', label: 'Mobile', render: (r) => <span className="tnum">{r.phone ?? '—'}</span> },
            { key: 'city', label: 'City' },
            { key: 'accounts', label: 'Accounts', align: 'right' },
            { key: 'kyc_status', label: 'KYC', render: (r) => <StatusBadge status={r.kyc_status} /> },
          ]} />
        )}
      </Card>
      {sel && <Panel id={sel} onClose={() => setSel(null)} onChanged={reload} />}
      {reg && <Register onClose={() => setReg(false)} onDone={(r, f) => { setReg(false); reload(); toast(`${f.name} registered`);
        setPw({ title: 'Temporary password', text: `${f.name} can sign in with their account number once an account is opened. Their temporary password is:`, password: r.temp_password }); setSel(r.cust_id); }} />}
      {pw && <TempPassword info={pw} onClose={() => setPw(null)} />}
    </div>
  );
}
