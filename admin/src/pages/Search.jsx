import { useState } from 'react';
import { api } from '@shared/api.js';
import { Alert, Button, Card, Input, Money, PageHeader, StatusBadge, Table, useAction } from '@shared/ui.jsx';
import { fmtDateTime, titleCase } from '@shared/format.js';

const EXAMPLES = ['Frozen accounts', 'Top 3 accounts by balance', 'Transfers above 10k this week', 'Deposits by branch', 'Savings accounts with balance over 50,000', 'Withdrawals today'];

export default function Search() {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const a = useAction();
  const ask = (t) => { setText(t); a.run(async () => setRes(await api('/staff/search', { method: 'POST', body: { text: t } }))); };
  const cols = res?.columns.map((c) => ({
    key: c, label: titleCase(c.replace(/_acc_no$/, '').replace('acc_no', 'account')),
    align: res.money.includes(c) ? 'right' : undefined,
    render: (r) => (res.money.includes(c) ? <Money value={r[c]} /> : c === 'status' ? <StatusBadge status={r[c]} /> : c === 'trans_date' ? fmtDateTime(r[c])
      : ['type_name', 'trans_type'].includes(c) ? titleCase(r[c]) : c.endsWith('acc_no') ? <span className="tnum">{r[c] ?? '—'}</span> : r[c]),
  }));
  return (
    <div className="soft-in">
      <PageHeader title="Ask in plain English" subtitle="Type a question about accounts, transactions or branch deposits." />
      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="mb-3 flex max-w-[760px] gap-2.5">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. frozen accounts, or transfers above 10k this week" autoFocus className="h-12 text-[16px]" />
        <Button type="submit" loading={a.busy} className="h-12" disabled={!text.trim()}>Ask</Button>
      </form>
      <div className="mb-8 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => <button key={e} onClick={() => ask(e)} className="rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-[13px] text-violet-700 transition hover:bg-violet-100">{e}</button>)}
      </div>
      <Alert>{a.error}</Alert>
      {res && (
        <div className="soft-in">
          <p className="mb-3 text-[14px] text-ink-500">{res.interpretation} · <span className="tnum">{res.rows.length}</span> result{res.rows.length === 1 ? '' : 's'}</p>
          <Card><Table rows={res.rows} columns={cols} /></Card>
        </div>
      )}
    </div>
  );
}
