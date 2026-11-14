import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { Alert, Button, Card, EmptyState, ErrorNote, Field, Input, KV, Loading, Modal, PageHeader, Progress, Segmented, Select, StatusBadge, Table, useAction, useToast } from '@shared/ui.jsx';
import { fmtDate, inr, titleCase } from '@shared/format.js';

const TYPES = ['HOME', 'AUTO', 'PERSONAL', 'EDUCATION', 'BUSINESS'];
const AMOUNT = /^[1-9]\d{0,12}(\.\d{1,2})?$/;

function LoanDetail({ loan, accounts, onClose, onChanged }) {
  const toast = useToast();
  const emis = useApi(`/customer/loans/${loan.loanId}/emis`);
  const pays = useApi(`/customer/loans/${loan.loanId}/payments`);
  const [emi, setEmi] = useState(null);
  const [acc, setAcc] = useState(accounts[0]?.accountNumber ?? '');
  const act = useAction();

  const pay = () => act.run(async () => {
    await api(`/customer/loans/${loan.loanId}/pay-emi`, { method: 'POST', body: { emiId: emi.emiId, accountNumber: acc } });
    toast('EMI paid');
    setEmi(null);
    emis.reload(); pays.reload(); onChanged();
  });

  const list = emis.data?.emis ?? [];
  const paid = list.filter((e) => e.status === 'PAID').length;
  return (
    <Modal open onClose={onClose} title={`${titleCase(loan.loanType)} loan #${loan.loanId}`} width={760}>
      <dl className="mb-5">
        <KV k="Status" v={<StatusBadge status={loan.status} />} />
        <KV k="Principal" v={inr(loan.principalAmount)} />
        <KV k="Outstanding" v={inr(loan.outstandingAmount)} />
        <KV k="Interest rate" v={`${loan.interestRate}% a year`} />
        <KV k="Tenure" v={`${loan.tenureMonths} months`} />
      </dl>
      {list.length > 0 && <div className="mb-5"><div className="mb-1.5 text-[13px] text-ink-400">{paid} of {list.length} installments paid</div><Progress value={(paid / list.length) * 100} /></div>}
      {emis.error && <ErrorNote onRetry={emis.reload}>{emis.error}</ErrorNote>}
      {emis.loading && !emis.data && <Loading />}
      {emis.data && (
        <Table dense rowKey="emiId" empty={<EmptyState title="No schedule yet">The bank creates the repayment schedule when it reviews your application.</EmptyState>}
          rows={list} columns={[
            { key: 'installmentNo', label: '#' },
            { key: 'dueDate', label: 'Due', render: (e) => fmtDate(e.dueDate) },
            { key: 'amount', label: 'EMI', align: 'right', render: (e) => inr(e.amount) },
            { key: 'status', label: 'Status', render: (e) => <StatusBadge status={e.status} /> },
            { key: 'pay', label: '', align: 'right', render: (e) => loan.status === 'ACTIVE' && e.status !== 'PAID'
              ? <Button size="sm" onClick={() => setEmi(e)}>Pay</Button> : null },
          ]} />
      )}
      {pays.data?.payments?.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-[17px]">Payments made</h3>
          <Table dense rowKey="paymentId" rows={pays.data.payments} columns={[
            { key: 'paymentDate', label: 'Date', render: (p) => fmtDate(p.paymentDate) },
            { key: 'amount', label: 'Amount', align: 'right', render: (p) => inr(p.amount) },
            { key: 'paymentMode', label: 'Mode', render: (p) => titleCase(p.paymentMode) },
          ]} />
        </div>
      )}
      <Modal open={!!emi} onClose={() => { setEmi(null); act.setError(''); }} title="Pay this EMI" width={440}>
        {emi && (
          <div className="space-y-4">
            <p className="text-ink-500">Installment {emi.installmentNo} of <span className="tnum font-semibold text-ink-900">{inr(emi.amount)}</span> will be debited from the account below.</p>
            <Field label="Pay from">
              <Select value={acc} onChange={(e) => setAcc(e.target.value)}>
                {accounts.map((a) => <option key={a.accountNumber} value={a.accountNumber}>••{a.accountNumber.slice(-4)} · {inr(a.balance)}</option>)}
              </Select>
            </Field>
            <Alert>{act.error}</Alert>
            <div className="flex justify-end gap-2.5">
              <Button variant="ghost" onClick={() => setEmi(null)}>Cancel</Button>
              <Button loading={act.busy} onClick={pay}>Pay {inr(emi.amount)}</Button>
            </div>
          </div>
        )}
      </Modal>
    </Modal>
  );
}

export default function Loans() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/customer/loans');
  const accs = useApi('/customer/accounts');
  const accounts = accs.data?.accounts ?? [];
  const [open, setOpen] = useState(null);
  const [apply, setApply] = useState(false);
  const [form, setForm] = useState({ accountNumber: '', loanType: 'PERSONAL', amount: '', tenureMonths: '12' });
  const act = useAction();

  const submit = (e) => {
    e.preventDefault();
    act.run(async () => {
      const t = Number(form.tenureMonths);
      if (!AMOUNT.test(form.amount)) throw new Error('Enter an amount like 250000 or 250000.50.');
      if (!Number.isInteger(t) || t < 1 || t > 360) throw new Error('Tenure must be between 1 and 360 months.');
      await api('/customer/loans', { method: 'POST', body: { accountNumber: form.accountNumber || accounts[0]?.accountNumber, loanType: form.loanType, amount: form.amount, tenureMonths: t } });
      toast('Application submitted');
      setApply(false); setForm({ ...form, amount: '' });
      reload();
    });
  };

  const loans = data?.loans ?? [];
  return (
    <div className="soft-in">
      <PageHeader title="Loans" subtitle="What you owe, what is next, and how far along you are." actions={<Button onClick={() => setApply(true)}>Apply for a loan</Button>} />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {loading && !data && <Loading />}
      {data && !loans.length && <Card><EmptyState title="No loans">When you apply for a loan it will appear here, with its repayment schedule once approved.</EmptyState></Card>}
      <div className="grid gap-5 md:grid-cols-2">
        {loans.map((l) => (
          <Card key={l.loanId} className="cursor-pointer p-6 transition hover:border-ink-200" onClick={() => setOpen(l)}>
            <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-violet-600">{titleCase(l.loanType)} loan</span><StatusBadge status={l.status} /></div>
            <div className="serif tnum mt-4 text-[34px] text-ink-900">{inr(l.outstandingAmount)}</div>
            <div className="text-[13.5px] text-ink-400">outstanding of {inr(l.principalAmount)}</div>
            <div className="mt-4 flex justify-between text-[13.5px] text-ink-500"><span>{l.interestRate}% · {l.tenureMonths} months</span><span>Since {fmtDate(l.startDate)}</span></div>
          </Card>
        ))}
      </div>
      {open && accs.data && <LoanDetail loan={open} accounts={accounts} onClose={() => setOpen(null)} onChanged={reload} />}

      <Modal open={apply} onClose={() => { setApply(false); act.setError(''); }} title="Apply for a loan" width={480}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Loan type"><div className="pt-0.5"><Segmented value={form.loanType} onChange={(v) => setForm({ ...form, loanType: v })} options={TYPES.map((t) => [t, titleCase(t)])} /></div></Field>
          <Field label="Account" hint="Must be active with verified KYC.">
            <Select value={form.accountNumber || accounts[0]?.accountNumber || ''} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}>
              {accounts.map((a) => <option key={a.accountNumber} value={a.accountNumber}>••{a.accountNumber.slice(-4)}</option>)}
            </Select>
          </Field>
          <Field label="Amount (₹)"><Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" required /></Field>
          <Field label="Tenure (months)"><Input value={form.tenureMonths} onChange={(e) => setForm({ ...form, tenureMonths: e.target.value.replace(/\D/g, '') })} inputMode="numeric" required /></Field>
          <Alert>{act.error}</Alert>
          <Button type="submit" loading={act.busy} className="w-full">Submit application</Button>
        </form>
      </Modal>
    </div>
  );
}
