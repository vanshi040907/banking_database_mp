import { useState } from 'react';
import { api } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';
import { Alert, Button, Card, Field, Input, KV, Money, PageHeader, Segmented, StatusBadge, useAction, useToast } from '@shared/ui.jsx';
import { fmtDateTime, groupAcc, titleCase } from '@shared/format.js';

export default function Cash() {
  const { can } = useAuth();
  const toast = useToast();
  const kinds = [can('CASH_DEPOSIT') && ['deposit', 'Deposit'], can('CASH_WITHDRAW') && ['withdraw', 'Withdraw']].filter(Boolean);
  const [kind, setKind] = useState(kinds[0][0]);
  const [acc, setAcc] = useState('');
  const [found, setFound] = useState(null);
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [done, setDone] = useState([]);
  const find = useAction();
  const go = useAction();

  const check = () => find.run(async () => { setFound(null); setFound(await api(`/staff/accounts/${acc.trim()}`)); });
  const submit = (e) => {
    e.preventDefault();
    go.run(async () => {
      const r = await api('/staff/cash', { method: 'POST', body: { acc_no: found.acc_no, kind, amount, remarks } });
      toast(`${kind === 'deposit' ? 'Deposit' : 'Withdrawal'} recorded`);
      setDone((d) => [{ ...r, kind, acc_no: found.acc_no }, ...d]);
      setFound({ ...found, balance: r.balance }); setAmount(''); setRemarks('');
    });
  };

  return (
    <div className="soft-in">
      <PageHeader title="Cash counter" subtitle="Record cash handed over the counter. Every entry is tied to your employee ID." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
        <Card as="form" onSubmit={submit} className="space-y-5 p-7">
          {kinds.length > 1 && <Segmented value={kind} onChange={setKind} options={kinds} />}
          <Field label="Account number">
            <div className="flex gap-2.5"><Input value={acc} onChange={(e) => { setAcc(e.target.value); setFound(null); }} inputMode="numeric" placeholder="10-digit account number" />
              <Button type="button" variant="secondary" loading={find.busy} onClick={check} disabled={!acc.trim()}>Find</Button></div>
          </Field>
          {find.error && <Alert>{find.error}</Alert>}
          {found && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-4 py-3">
              <div className="flex items-center justify-between"><span className="tnum font-medium">{groupAcc(found.acc_no)}</span><StatusBadge status={found.status} /></div>
              <div className="mt-0.5 text-[13.5px] text-ink-500">{found.customer?.name ? `${found.customer.name} · ` : ''}{titleCase(found.type_name)} · Balance <Money value={found.balance} className="font-medium text-ink-800" /></div>
            </div>
          )}
          <Field label="Amount"><Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="0.00" className="serif tnum text-[22px]" disabled={!found} /></Field>
          <Field label="Remarks (optional)"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={120} disabled={!found} /></Field>
          <Alert>{go.error}</Alert>
          <Button type="submit" loading={go.busy} disabled={!found || !(Number(amount) > 0)} className="w-full">Record {kind}</Button>
        </Card>
        <aside>
          <h2 className="mb-3 text-[20px]">This session</h2>
          {done.length === 0 ? <p className="text-[14px] text-ink-400">Entries you record will be listed here.</p> : (
            <div className="space-y-3">{done.map((r) => (
              <Card key={r.trans_id} className="px-5 py-3"><dl>
                <KV k={`${titleCase(r.trans_type)} · ${groupAcc(r.acc_no)}`} v={<Money value={r.amount} className="font-medium" />} />
                <KV k={fmtDateTime(r.trans_date)} v={<>Balance <Money value={r.balance} /></>} /></dl></Card>))}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
