import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';
import { Alert, Badge, Button, Card, EmptyState, ErrorNote, Field, Input, KV, Loading, Modal, Money, PageHeader, Segmented, StatusBadge, Table, Textarea, useAction, useToast } from '@shared/ui.jsx';
import { fmtDate, fmtDateTime, groupAcc, inr, titleCase } from '@shared/format.js';

function Panel({ acc, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: a, error, reload } = useApi(`/staff/accounts/${acc}`);
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const act = useAction();

  const submit = () => act.run(async () => {
    if (mode === 'close') await api(`/staff/accounts/${acc}/close`, { method: 'POST', body: { reason } });
    else await api(`/staff/accounts/${acc}/status`, { method: 'POST', body: { status: mode === 'freeze' ? 'FROZEN' : 'ACTIVE', reason } });
    toast(mode === 'close' ? 'Account closed' : mode === 'freeze' ? 'Account frozen' : 'Account unfrozen');
    setMode(null); setReason(''); reload(); onChanged();
  });

  return (
    <Modal open side onClose={onClose} title={`Account ${groupAcc(acc)}`} width={620}>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!a && !error && <Loading />}
      {a && (
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div><div className="text-[13px] text-ink-400">Balance</div><Money value={a.balance} className="serif text-[38px] leading-tight text-ink-900" /></div>
            <div className="flex gap-1.5">{a.is_primary ? <Badge tone="violet">Primary</Badge> : null}<StatusBadge status={a.status} /></div>
          </div>
          <dl className="rounded-lg border border-line px-4">
            {a.customer && <KV k="Holder" v={a.customer.name} />}
            <KV k="Type" v={titleCase(a.type_name)} /><KV k="Branch" v={`${a.branch_name} (${a.branch_ifsc})`} />
            <KV k="Opened" v={fmtDate(a.creation_date)} />{a.closed_date && <KV k="Closed" v={fmtDate(a.closed_date)} />}
            <KV k="Minimum balance" v={inr(a.min_balance)} /><KV k="Daily limit" v={inr(a.daily_txn_limit)} />
          </dl>

          {a.status !== 'CLOSED' && (can('FREEZE_ACCOUNT') || can('CLOSE_ACCOUNT')) && (
            <div>
              {!mode ? (
                <div className="flex gap-2.5">
                  {can('FREEZE_ACCOUNT') && (a.status === 'ACTIVE'
                    ? <Button variant="secondary" size="sm" onClick={() => setMode('freeze')}>Freeze account</Button>
                    : <Button variant="secondary" size="sm" onClick={() => setMode('unfreeze')}>Unfreeze account</Button>)}
                  {can('CLOSE_ACCOUNT') && <Button variant="danger" size="sm" onClick={() => setMode('close')}>Close account</Button>}
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/60 p-4">
                  <Field label={`Reason to ${mode} this account`} hint="Recorded in the audit log. At least 5 characters.">
                    <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[70px]" />
                  </Field>
                  {mode === 'close' && <Alert tone="info">An account can only be closed once its balance is zero.</Alert>}
                  <Alert>{act.error}</Alert>
                  <div className="flex gap-2.5"><Button size="sm" variant={mode === 'close' ? 'danger' : 'primary'} loading={act.busy} onClick={submit}>Confirm {mode}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setMode(null); act.setError(''); }}>Cancel</Button></div>
                </div>
              )}
            </div>
          )}

          {a.transactions && (
            <section><h3 className="mb-2 text-[18px]">Recent transactions</h3>
              <div className="rounded-lg border border-line">
                <Table dense rowKey="trans_id" rows={a.transactions.slice(0, 12)} empty={<EmptyState title="No transactions" />} columns={[
                  { key: 'trans_date', label: 'When', render: (r) => fmtDateTime(r.trans_date) },
                  { key: 'trans_type', label: 'Type', render: (r) => `${titleCase(r.trans_type)} · ${r.direction === 'CREDIT' ? 'in' : 'out'}` },
                  { key: 'amount', label: 'Amount', align: 'right', render: (r) => <Money value={r.amount} className={r.direction === 'CREDIT' ? 'text-ok-600' : ''} /> },
                ]} /></div></section>
          )}
          {a.audit?.length > 0 && (
            <section><h3 className="mb-2 text-[18px]">History</h3>
              <ul className="space-y-2.5 text-[14px]">{a.audit.map((l) => (
                <li key={l.log_id} className="rounded-lg border border-line px-3.5 py-2.5"><div className="flex justify-between"><span className="font-medium">{titleCase(l.action)}</span><span className="text-ink-400">{fmtDateTime(l.created_at)}</span></div>
                  <div className="text-ink-400">{l.emp_name ?? 'System'}{l.details ? ` · ${l.details}` : ''}</div></li>))}</ul></section>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Accounts() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sel, setSel] = useState(null);
  const personal = can('VIEW_PERSONAL_INFO');
  const { data, error, loading, reload } = useApi(`/staff/accounts?q=${encodeURIComponent(q)}&status=${status}`, []);

  return (
    <div className="soft-in">
      <PageHeader title="Accounts" subtitle={personal ? 'Search by account number or holder name.' : 'Personal details are hidden for your role.'} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={personal ? 'Search accounts or names' : 'Search by account number'} className="max-w-[360px]" />
        <Segmented value={status} onChange={setStatus} options={[['', 'All'], ['ACTIVE', 'Active'], ['FROZEN', 'Frozen'], ['CLOSED', 'Closed']]} />
      </div>
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      <Card>
        {loading && !data ? <Loading /> : (
          <Table rowKey="acc_no" rows={data} onRowClick={(r) => setSel(r.acc_no)} empty={<EmptyState title="No accounts found">Try a different search or filter.</EmptyState>} columns={[
            { key: 'acc_no', label: 'Account', render: (r) => <span className="tnum font-medium">{groupAcc(r.acc_no)}</span> },
            ...(personal ? [{ key: 'customer_name', label: 'Holder' }] : []),
            { key: 'type_name', label: 'Type', render: (r) => titleCase(r.type_name) },
            { key: 'branch_name', label: 'Branch' },
            { key: 'balance', label: 'Balance', align: 'right', render: (r) => <Money value={r.balance} className="font-medium" /> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]} />
        )}
      </Card>
      {sel && <Panel acc={sel} onClose={() => setSel(null)} onChanged={reload} />}
    </div>
  );
}
