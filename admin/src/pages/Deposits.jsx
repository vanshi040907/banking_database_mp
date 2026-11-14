import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { Alert, Button, Card, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Stat, StatusBadge, Table, useAction, useToast } from '@shared/ui.jsx';
import { fmtDateTime, inr } from '@shared/format.js';

const AMOUNT = /^[1-9]\d{0,12}(\.\d{1,2})?$/;
const digits = (s) => s.replace(/\D/g, '');
const money = (s) => s.replace(/[^\d.]/g, '');

export default function Deposits() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const summary = useApi('/employee/deposits/summary');
  const hist = useApi(`/employee/deposits?page=${page}`);
  const [acc, setAcc] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [receipt, setReceipt] = useState(null);
  const act = useAction();
  const rc = useAction();

  const submit = (e) => {
    e.preventDefault();
    act.run(async () => {
      if (!AMOUNT.test(amount)) throw new Error('Enter an amount like 5000 or 5000.50.');
      await api('/employee/deposits', { method: 'POST', body: { accountNumber: acc, amount, ...(remarks ? { remarks } : {}) } });
      toast('Cash deposit recorded');
      setAcc(''); setAmount(''); setRemarks('');
      summary.reload(); setPage(1); hist.reload();
    });
  };
  const view = (d) => rc.run(async () => { setReceipt((await api(`/employee/deposits/${d.transactionId}`)).receipt); });

  const s = summary.data;
  return (
    <div className="soft-in space-y-8">
      <PageHeader title="Cash deposits" subtitle="Take cash over the counter into an account in your branch." />
      {s && <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Today" value={inr(s.todayAmount)} hint={`${s.todayDeposits} deposits`} />
        <Stat label="All time" value={inr(s.totalAmount)} hint={`${s.totalDeposits} deposits`} />
      </div>}
      <Card as="form" onSubmit={submit} className="max-w-[560px] space-y-5 p-7">
        <h2 className="text-[22px]">New deposit</h2>
        <Field label="Account number"><Input value={acc} onChange={(e) => setAcc(digits(e.target.value))} inputMode="numeric" required /></Field>
        <Field label="Amount (₹)"><Input value={amount} onChange={(e) => setAmount(money(e.target.value))} inputMode="decimal" required className="serif tnum text-[20px]" /></Field>
        <Field label="Remarks (optional)"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={255} /></Field>
        <Alert>{act.error}</Alert>
        <Button type="submit" loading={act.busy} disabled={acc.length < 6 || !amount} className="w-full">Record deposit</Button>
      </Card>
      <section>
        <h2 className="mb-3 text-[21px]">Branch history</h2>
        <Alert>{rc.error}</Alert>
        {hist.error && <ErrorNote onRetry={hist.reload}>{hist.error}</ErrorNote>}
        {hist.loading && !hist.data && <Loading />}
        {hist.data && <Card><Table rowKey="transactionId" rows={hist.data.deposits} onRowClick={view} empty={<EmptyState title="No deposits yet" />} columns={[
          { key: 'transactionDate', label: 'When', render: (d) => fmtDateTime(d.transactionDate) },
          { key: 'referenceNumber', label: 'Reference' },
          { key: 'accountNumber', label: 'Account' },
          { key: 'amount', label: 'Amount', align: 'right', render: (d) => inr(d.amount) },
          { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
        ]} /></Card>}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={page < 2} onClick={() => setPage(page - 1)}>Newer</Button>
          <Button variant="ghost" size="sm" disabled={(hist.data?.deposits.length ?? 0) < (hist.data?.pageSize ?? 20)} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      </section>
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Deposit receipt" width={460}>
        {receipt && <dl>{[['Reference', receipt.referenceNumber], ['Account', receipt.accountNumber], ['Amount', inr(receipt.amount)], ['Branch', `${receipt.branchName} (${receipt.branchIfsc})`], ['When', fmtDateTime(receipt.transactionDate)], ['Employee', receipt.employeeId], ['Remarks', receipt.remarks || '—']].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6 border-b border-line/70 py-2.5 last:border-0"><dt className="text-[13.5px] text-ink-400">{k}</dt><dd className="text-[14.5px]">{v}</dd></div>))}</dl>}
      </Modal>
    </div>
  );
}
