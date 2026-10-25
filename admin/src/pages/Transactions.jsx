import { useState } from 'react';
import { useApi } from '@shared/api.js';
import { Card, EmptyState, ErrorNote, Input, Loading, Money, PageHeader, Segmented, StatusBadge, Table } from '@shared/ui.jsx';
import { fmtDateTime, titleCase } from '@shared/format.js';

export default function Transactions() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const { data, error, loading, reload } = useApi(`/staff/transactions?q=${encodeURIComponent(q)}&type=${type}`, []);
  return (
    <div className="soft-in">
      <PageHeader title="Transactions" subtitle="Every movement of money in your scope, newest first." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Account number or reference" className="max-w-[360px]" />
        <Segmented value={type} onChange={setType} options={[['', 'All'], ['DEPOSIT', 'Deposits'], ['WITHDRAWAL', 'Withdrawals'], ['TRANSFER', 'Transfers']]} />
      </div>
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      <Card>
        {loading && !data ? <Loading /> : (
          <Table rowKey="trans_id" rows={data} empty={<EmptyState title="No transactions match" />} columns={[
            { key: 'trans_date', label: 'When', render: (r) => fmtDateTime(r.trans_date) },
            { key: 'trans_type', label: 'Type', render: (r) => `${titleCase(r.trans_type)} · ${r.trans_mode}` },
            { key: 'from_acc_no', label: 'From', render: (r) => <span className="tnum">{r.from_acc_no ?? '—'}</span> },
            { key: 'to_acc_no', label: 'To', render: (r) => <span className="tnum">{r.to_acc_no ?? '—'}</span> },
            { key: 'amount', label: 'Amount', align: 'right', render: (r) => <Money value={r.amount} className="font-medium" /> },
            { key: 'trans_status', label: '', render: (r) => <StatusBadge status={r.trans_status} /> },
          ]} />
        )}
      </Card>
    </div>
  );
}
