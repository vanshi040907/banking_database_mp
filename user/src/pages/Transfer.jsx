import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, useApi } from '@shared/api.js';
import { Alert, Button, Card, ErrorNote, Field, Input, Loading, PageHeader, Select, useAction, useToast } from '@shared/ui.jsx';
import { inr } from '@shared/format.js';

const AMOUNT = /^(0|[1-9]\d{0,12})(\.\d{1,2})?$/;
// accepts "123456@inkwell" (what the QR carries) or a plain account number
const fromId = (v) => { const t = v.trim().toLowerCase(); return /^\d{6,20}@inkwell$/.test(t) ? t.split('@')[0] : t.replace(/\D/g, ''); };
const digits = (s) => s.replace(/\D/g, '');

export default function Transfer() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/customer/accounts');
  const accounts = data?.accounts ?? [];
  const [from, setFrom] = useState('');
  const [params] = useSearchParams();
  const [to, setTo] = useState(fromId(params.get('to') || ''));
  const [share, setShare] = useState('');
  const [qr, setQr] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [pin, setPin] = useState('');
  const [done, setDone] = useState(null);
  const act = useAction();
  // one key per attempt: a retry of the same transfer can never be applied twice
  const key = useRef(crypto.randomUUID());
  const edit = (fn) => (e) => { key.current = crypto.randomUUID(); fn(e.target.value); };

  useEffect(() => {
    if (!share) { setQr(''); return undefined; }
    let live = true;
    QRCode.toDataURL(`${window.location.origin}/transfer?to=${encodeURIComponent(`${share}@inkwell`)}`, { width: 240, margin: 2 })
      .then((img) => live && setQr(img)).catch(() => live && setQr(''));
    return () => { live = false; };
  }, [share]);

  const source = from || accounts[0]?.accountNumber || '';
  const submit = (e) => {
    e.preventDefault();
    act.run(async () => {
      if (!AMOUNT.test(amount) || Number(amount) <= 0) throw new Error('Enter an amount like 500 or 500.50.');
      const r = await api('/customer/transfers', { method: 'POST', signOutOnUnauthorized: false, body: {
        fromAccNo: source, toAccNo: to, amount, transactionPin: pin, idempotencyKey: key.current,
        ...(remarks ? { remarks } : {}) } });
      toast('Transfer sent');
      setDone(r);
      setTo(''); setAmount(''); setRemarks(''); setPin('');
      key.current = crypto.randomUUID();
      reload();
    });
  };

  return (
    <div className="soft-in">
      <PageHeader title="Send money" subtitle="Move money to any account by its account number." />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {loading && !data && <Loading />}
      {data && (
        <Card as="form" onSubmit={submit} className="max-w-[560px] space-y-5 p-7">
          <Field label="From">
            <Select value={source} onChange={edit(setFrom)}>
              {accounts.map((a) => <option key={a.accountNumber} value={a.accountNumber}>••{a.accountNumber.slice(-4)} · {inr(a.balance)}</option>)}
            </Select>
          </Field>
          <Field label="To account number" hint="Or paste an ID like 123456@inkwell."><Input value={to} onChange={edit((v) => setTo(fromId(v)))} inputMode="numeric" required /></Field>
          <Field label="Amount (₹)"><Input value={amount} onChange={edit((v) => setAmount(v.replace(/[^\d.]/g, '')))} inputMode="decimal" required className="serif tnum text-[22px]" /></Field>
          <Field label="Note (optional)"><Input value={remarks} onChange={edit(setRemarks)} maxLength={255} /></Field>
          <Field label="Transaction PIN" hint={<>Six digits. Not set yet? <Link to="/security" className="underline">Set it up in Security</Link>.</>}>
            <Input type="password" value={pin} onChange={(e) => setPin(digits(e.target.value).slice(0, 6))} inputMode="numeric" autoComplete="off" required />
          </Field>
          <Alert>{act.error}</Alert>
          {done && <Alert tone="ok">Sent {inr(done.amount)} to ••{done.toAccount.slice(-4)}. Reference {done.transactionId}.</Alert>}
          <Button type="submit" loading={act.busy} disabled={!source || to.length < 6 || !amount || pin.length !== 6} className="w-full">Send money</Button>
        </Card>
      )}
      {data && (
        <Card className="mt-6 max-w-[560px] space-y-4 p-7">
          <h2 className="text-[22px]">Receive with QR</h2>
          <p className="text-[14px] text-ink-400">Show this to the person paying you. Scanning it opens this page with your account filled in. It only works on a phone that can reach this site.</p>
          <Select value={share} onChange={(e) => setShare(e.target.value)}>
            <option value="">Choose an account</option>
            {accounts.filter((a) => a.status === 'ACTIVE').map((a) => <option key={a.accountNumber} value={a.accountNumber}>••{a.accountNumber.slice(-4)}</option>)}
          </Select>
          {qr && <div className="text-center"><img src={qr} alt="Payment QR code" className="mx-auto rounded-lg border border-line" /><p className="tnum mt-2 text-[13.5px] text-ink-500">{share}@inkwell</p></div>}
        </Card>
      )}
    </div>
  );
}
