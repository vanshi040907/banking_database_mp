import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, useApi } from '@shared/api.js';
import { Art } from '@shared/Art.jsx';
import { Alert, Button, Card, Field, Input, KV, Loading, Money, OtpInput, Segmented, Select, Textarea, useAction } from '@shared/ui.jsx';
import { fmtDateTime, groupAcc, inr, titleCase } from '@shared/format.js';

export default function Transfer() {
  const { state } = useLocation();
  const { data: accounts } = useApi('/customer/accounts');
  const { data: payees } = useApi('/customer/payees');
  const [step, setStep] = useState('form');
  const [from, setFrom] = useState(state?.from ?? '');
  const [kind, setKind] = useState('account');
  const [target, setTarget] = useState('');
  const [payee, setPayee] = useState(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('UPI');
  const [remarks, setRemarks] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const find = useAction();
  const go = useAction();

  const source = accounts?.find((a) => a.acc_no === (from || accounts?.[0]?.acc_no));
  const active = accounts?.filter((a) => a.status === 'ACTIVE') ?? [];
  const sourceAcc = source?.acc_no;

  const lookup = (type, value) => find.run(async () => {
    const r = await api('/customer/lookup', { method: 'POST', body: { type, value } });
    setPayee(r);
  });
  const pick = (p) => { setKind('account'); setTarget(p.acc_no); lookup('account', p.acc_no); };

  const start = (e) => {
    e.preventDefault();
    go.run(async () => {
      if (!payee) throw new Error('Find the person you are paying first');
      setChallenge(await api('/customer/transfer/start', { method: 'POST', body: { from: sourceAcc, to: payee.acc_no, amount, mode, remarks } }));
      setStep('otp');
    });
  };
  const confirm = (otp) => go.run(async () => {
    setReceipt(await api('/customer/transfer/confirm', { method: 'POST', body: { challenge_id: challenge.challenge_id, otp } }));
    setStep('done');
  });
  const reset = () => { setStep('form'); setPayee(null); setTarget(''); setAmount(''); setRemarks(''); setChallenge(null); setReceipt(null); go.setError(''); };

  if (!accounts) return <Loading />;

  if (step === 'done') return (
    <div className="soft-in mx-auto max-w-[640px] text-center">
      <Art name="sailboat" fade="l r b t" fadeSize={16} className="mx-auto h-[190px] w-full max-w-[620px]" imgClassName="object-contain" />
      <h1 className="mt-2 text-[40px]">On its way.</h1>
      <p className="mt-2 text-ink-400"><Money value={receipt.amount} className="font-medium text-ink-800" /> was sent to {receipt.to_name}</p>
      <Card className="mx-auto mt-8 max-w-[460px] px-6 py-2 text-left">
        <dl>
          <KV k="To" v={<>{receipt.to_name} <span className="tnum text-ink-400">· {groupAcc(receipt.to_acc_no)}</span></>} />
          <KV k="Mode" v={receipt.trans_mode} />
          <KV k="When" v={fmtDateTime(receipt.trans_date)} />
          <KV k="Reference" v={<span className="tnum text-[12.5px]">{receipt.reference_no}</span>} />
        </dl>
      </Card>
      <div className="mt-8 flex justify-center gap-3"><Link to="/"><Button variant="secondary">Back to overview</Button></Link><Button onClick={reset}>Send another</Button></div>
    </div>
  );

  return (
    <div className="soft-in">
      <h1 className="mb-1 text-[36px]">Send money</h1>
      <p className="mb-8 text-ink-400">Move money to any Inkwell account by account number or mobile number.</p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,620px)_1fr]">
        {step === 'form' ? (
          <Card as="form" onSubmit={start} className="space-y-5 p-7">
            <Field label="From">
              <Select value={sourceAcc ?? ''} onChange={(e) => setFrom(e.target.value)}>
                {active.map((a) => <option key={a.acc_no} value={a.acc_no}>{titleCase(a.type_name)} · {groupAcc(a.acc_no)} · {inr(a.balance)}</option>)}
              </Select>
            </Field>

            <div>
              <div className="mb-1.5 flex items-center justify-between"><span className="text-[13px] font-medium text-ink-700">To</span>
                <Segmented value={kind} onChange={(k) => { setKind(k); setTarget(''); setPayee(null); }} options={[['account', 'Account number'], ['mobile', 'Mobile number']]} /></div>
              <div className="flex gap-2.5">
                <Input value={target} onChange={(e) => { setTarget(e.target.value); setPayee(null); }} inputMode="numeric"
                  placeholder={kind === 'account' ? '10-digit account number' : '10-digit mobile number'} />
                <Button type="button" variant="secondary" loading={find.busy} onClick={() => lookup(kind, target)}>Find</Button>
              </div>
              {find.error && <p className="mt-1.5 text-[12.5px] text-danger-600">{find.error}</p>}
              {payee && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#cfe6df] bg-ok-50 px-3.5 py-2.5 text-[14px]">
                  <span className="text-ok-600">✓</span><span className="font-medium text-ink-900">{payee.name}</span>
                  <span className="text-ink-400 tnum">{groupAcc(payee.acc_no)} · {payee.branch_name}</span>
                </div>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Amount" hint={source ? `Available ${inr(source.balance)}` : undefined}>
                <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="0.00" required className="serif tnum text-[20px]" />
              </Field>
              <Field label="Mode">
                <div className="pt-0.5"><Segmented value={mode} onChange={setMode} options={['UPI', 'IMPS', 'NEFT']} className="w-full [&>button]:flex-1" /></div>
              </Field>
            </div>
            <Field label="Note (optional)"><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={120} placeholder="What is this for?" className="min-h-[64px]" /></Field>
            <Alert>{go.error}</Alert>
            <Button type="submit" loading={go.busy} className="w-full" disabled={!payee || !(Number(amount) > 0)}>Review and confirm</Button>
          </Card>
        ) : (
          <Card className="p-7">
            <h2 className="text-[24px]">Confirm with your code</h2>
            <p className="mb-5 mt-1 text-ink-400">We sent a six-digit code to your registered number.</p>
            <dl className="mb-6 rounded-lg bg-violet-50 px-5 py-1">
              <KV k="Sending" v={<Money value={amount} className="serif text-[22px]" />} />
              <KV k="To" v={<>{challenge.to_name} <span className="tnum text-ink-400">· {groupAcc(payee.acc_no)}</span></>} />
              <KV k="From" v={<span className="tnum">{groupAcc(sourceAcc)}</span>} />
            </dl>
            <OtpInput onComplete={confirm} disabled={go.busy} />
            <div className="mt-4 min-h-[44px]"><Alert>{go.error}</Alert></div>
            {challenge.dev_otp && <p className="rounded-lg bg-violet-50 px-3.5 py-2.5 text-[13px] text-violet-700">Development mode: your code is <span className="tnum font-semibold">{challenge.dev_otp}</span>.</p>}
            <button className="mt-5 text-[14px] text-ink-500 underline underline-offset-4 hover:text-ink-800" onClick={() => { setStep('form'); go.setError(''); }}>Change details</button>
          </Card>
        )}

        <aside className="space-y-6">
          {payees && [['Recent', payees.recent], ['Frequent', payees.frequent]].map(([title, list]) => list.length > 0 && (
            <Card key={title} className="p-5">
              <h3 className="mb-2 text-[17px]">{title} payees</h3>
              <ul>
                {list.map((p) => (
                  <li key={p.acc_no}>
                    <button type="button" onClick={() => step === 'form' && pick(p)} className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left hover:bg-violet-50">
                      <span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-[12px] font-semibold text-violet-700">{p.name[0]}</span>
                        <span className="text-[14.5px] font-medium">{p.name}</span></span>
                      <span className="text-[12.5px] text-ink-400 tnum">{groupAcc(p.acc_no).slice(-4)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </aside>
      </div>
    </div>
  );
}
