import { useState } from 'react';
import { api } from '@shared/api.js';
import { Alert, Button, Card, Field, Input, PageHeader, useAction, useToast } from '@shared/ui.jsx';
import { inr } from '@shared/format.js';

const digits = (s) => s.replace(/\D/g, '');

export default function Loans() {
  const toast = useToast();
  const [loanId, setLoanId] = useState('');
  const [acc, setAcc] = useState('');
  const [log, setLog] = useState([]);
  const sched = useAction();
  const disb = useAction();

  const schedule = () => sched.run(async () => {
    const r = await api(`/employee/loans/${loanId}/schedule`, { method: 'POST' });
    toast('Schedule created');
    setLog((l) => [`Loan #${r.loanId}: repayment schedule created (${r.installments} installments)`, ...l]);
  });
  const disburse = () => disb.run(async () => {
    const r = await api(`/employee/loans/${loanId}/disburse`, { method: 'POST', body: { accountNumber: acc } });
    toast('Loan disbursed');
    setLog((l) => [`Loan #${r.loanId}: disbursed to ••${r.accountNumber.slice(-4)}, outstanding ${inr(r.outstandingAmount)}`, ...l]);
    setAcc('');
  });

  return (
    <div className="soft-in">
      <PageHeader title="Loans" subtitle="Create the repayment schedule for a pending loan, then approve and disburse it." />
      <Card className="max-w-[560px] space-y-5 p-7">
        <Field label="Loan ID"><Input value={loanId} onChange={(e) => setLoanId(digits(e.target.value))} inputMode="numeric" placeholder="e.g. 1" /></Field>
        <div>
          <Button onClick={schedule} loading={sched.busy} disabled={!loanId} className="w-full">1. Create EMI schedule</Button>
          <div className="mt-2"><Alert>{sched.error}</Alert></div>
        </div>
        <Field label="Disburse to account" hint="The loan must be pending and have a complete schedule."><Input value={acc} onChange={(e) => setAcc(digits(e.target.value))} inputMode="numeric" placeholder="Account number" /></Field>
        <div>
          <Button onClick={disburse} loading={disb.busy} disabled={!loanId || acc.length < 6} className="w-full">2. Approve and disburse</Button>
          <div className="mt-2"><Alert>{disb.error}</Alert></div>
        </div>
      </Card>
      {log.length > 0 && <section className="mt-8"><h2 className="mb-3 text-[21px]">This session</h2><Card className="divide-y divide-line">{log.map((t, i) => <div key={i} className="px-5 py-3 text-[14.5px]">{t}</div>)}</Card></section>}
    </div>
  );
}
