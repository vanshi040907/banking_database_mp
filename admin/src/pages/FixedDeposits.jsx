import { useState } from 'react';
import { api } from '@shared/api.js';
import { Alert, Button, Card, Field, Input, PageHeader, useAction, useToast } from '@shared/ui.jsx';
import { fmtDate, inr } from '@shared/format.js';

const AMOUNT = /^[1-9]\d{0,12}(\.\d{1,2})?$/;
const digits = (s) => s.replace(/\D/g, '');
const money = (s) => s.replace(/[^\d.]/g, '');

export default function FixedDeposits() {
  const toast = useToast();
  const [f, setF] = useState({ customerId: '', accountNumber: '', amount: '', interestRate: '', durationMonths: '' });
  const [fdId, setFdId] = useState('');
  const [log, setLog] = useState([]);
  const create = useAction();
  const mature = useAction();
  const set = (k, fn = (v) => v) => (e) => setF({ ...f, [k]: fn(e.target.value) });

  const submit = (e) => {
    e.preventDefault();
    create.run(async () => {
      if (!AMOUNT.test(f.amount)) throw new Error('Enter an amount like 100000 or 100000.50.');
      const r = await api('/employee/fixed-deposits', { method: 'POST', body: { ...f, durationMonths: Number(f.durationMonths) } });
      toast('Fixed deposit created');
      setLog((l) => [`Created: ${inr(r.principalAmount)} at ${r.interestRate}% for ${r.durationMonths} months, customer ${r.customerId}`, ...l]);
      setF({ customerId: '', accountNumber: '', amount: '', interestRate: '', durationMonths: '' });
    });
  };
  const doMature = () => mature.run(async () => {
    const r = (await api(`/employee/fixed-deposits/${fdId}/mature`, { method: 'POST' })).fixedDeposit;
    toast('Fixed deposit matured');
    setLog((l) => [`FD #${r.fdId} matured: ${inr(r.estimatedMaturityAmount)} (${fmtDate(r.maturityDate)})`, ...l]);
    setFdId('');
  });

  return (
    <div className="soft-in">
      <PageHeader title="Fixed deposits" subtitle="Open a fixed deposit for a customer and process it when it matures." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="form" onSubmit={submit} className="space-y-5 p-7">
          <h2 className="text-[22px]">Open a fixed deposit</h2>
          <Field label="Customer ID"><Input value={f.customerId} onChange={set('customerId', digits)} inputMode="numeric" required /></Field>
          <Field label="Funding account" hint="Must belong to the customer, be active and have enough balance."><Input value={f.accountNumber} onChange={set('accountNumber', digits)} inputMode="numeric" required /></Field>
          <Field label="Amount (₹)"><Input value={f.amount} onChange={set('amount', money)} inputMode="decimal" required /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Interest rate (% a year)"><Input value={f.interestRate} onChange={set('interestRate', money)} inputMode="decimal" placeholder="7.00" required /></Field>
            <Field label="Duration (months)"><Input value={f.durationMonths} onChange={set('durationMonths', digits)} inputMode="numeric" required /></Field>
          </div>
          <Alert>{create.error}</Alert>
          <Button type="submit" loading={create.busy} className="w-full">Create fixed deposit</Button>
        </Card>
        <Card className="h-fit space-y-5 p-7">
          <h2 className="text-[22px]">Process maturity</h2>
          <Field label="FD ID" hint="Only works once the maturity date has passed."><Input value={fdId} onChange={(e) => setFdId(digits(e.target.value))} inputMode="numeric" /></Field>
          <Alert>{mature.error}</Alert>
          <Button onClick={doMature} loading={mature.busy} disabled={!fdId} className="w-full">Mature fixed deposit</Button>
        </Card>
      </div>
      {log.length > 0 && <section className="mt-8"><h2 className="mb-3 text-[21px]">This session</h2><Card className="divide-y divide-line">{log.map((t, i) => <div key={i} className="px-5 py-3 text-[14.5px]">{t}</div>)}</Card></section>}
    </div>
  );
}
