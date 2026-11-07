import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { Alert, Button, Card, Field, Input } from '@shared/ui.jsx';
const storageKey='bank.razorpay-test-payout';
function saved() { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { return null; } }
export default function RazorpayTestPayout() {
  const {data}=useApi('/customer/accounts');
  const history=useApi('/customer/test-upi-payouts');
  const [account,setAccount]=useState(''); const [name,setName]=useState(''); const [vpa,setVpa]=useState(''); const [amount,setAmount]=useState(''); const [pin,setPin]=useState('');
  const [request,setRequest]=useState(saved); const [result,setResult]=useState(null); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(e) {
    e.preventDefault(); if (busy || request) return;
    const item={idempotencyKey:crypto.randomUUID(),fromAccNo:account,name,vpa,amount};
    try { sessionStorage.setItem(storageKey,JSON.stringify(item)); } catch { setError('Session storage is required to protect the request from duplicate submission.'); return; }
    setRequest(item); setBusy(true); setError('');
    try { setResult(await api('/customer/test-upi-payouts',{method:'POST',body:{...item,transactionPin:pin}})); }
    catch(err) {
      setError(err.message);
      if ((err.status >= 400 && err.status < 500 && err.status !== 409) || (err.status === 503 && err.message === 'RazorpayX test payouts are not configured.')) { sessionStorage.removeItem(storageKey); setRequest(null); }
    } finally { setPin(''); setBusy(false); }
  }
  async function check() { setBusy(true); setError(''); try { setResult(await api(`/customer/test-upi-payouts/${request.idempotencyKey}?refresh=true`)); } catch(e) { setError(e.message); } finally { setBusy(false); } }
  function clear() { sessionStorage.removeItem(storageKey); setRequest(null); setResult(null); setError(''); }
  return <Card className="p-6 mt-6">
    <h2 className="text-xl font-semibold">Send to UPI ID â€” RazorpayX test</h2>
    <p className="mt-2 mb-4 text-sm">Test only. This uses your demo bank balance and RazorpayX test funds; no real payment is made. A pending amount remains reserved until its status is confirmed.</p>
    {!request ? <form onSubmit={submit} className="space-y-4">
      <Field label="Your account"><select className="w-full rounded border p-2" value={account} onChange={e=>setAccount(e.target.value)} required><option value="">Select an account</option>{(data?.accounts || []).filter(a=>a.status === 'ACTIVE').map(a=><option key={a.accountNumber} value={a.accountNumber}>{a.accountNumber} â€” â‚¹{a.balance}</option>)}</select></Field>
      <Field label="Recipient name"><Input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required /></Field>
      <Field label="Recipient UPI ID"><Input value={vpa} onChange={e=>setVpa(e.target.value)} placeholder="name@bank" required /></Field>
      <Field label="Amount (INR)"><Input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" required /></Field>
      <Field label="Transaction PIN"><Input type="password" value={pin} onChange={e=>setPin(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="off" required /></Field>
      <Button type="submit" disabled={busy}>Send test payout</Button>
    </form> : <div className="space-y-3"><p>Request: {request.idempotencyKey}</p><p>Status: {result?.state || 'Not confirmed'}</p><p className="text-sm">If the status cannot be confirmed, contact the administrator before trying again. An unknown result does not mean the payout failed.</p><Button type="button" disabled={busy} onClick={check}>Check status</Button>{['PROCESSED','RELEASED'].includes(result?.state) && <Button type="button" onClick={clear}>Make another test payout</Button>}</div>}
    {error && <Alert>{error}</Alert>}
    {history.data?.payouts?.length > 0 && <div className="mt-6"><h3 className="font-semibold">Recent test payouts</h3>{history.data.payouts.map(item => <div key={item.requestId} className="mt-2 text-sm"><span>{item.recipient} Â· â‚¹{(item.amountPaise / 100).toFixed(2)} Â· {item.state}</span> <button type="button" className="underline" onClick={() => { const savedRequest={idempotencyKey:item.requestId}; try { sessionStorage.setItem(storageKey,JSON.stringify(savedRequest)); setRequest(savedRequest); setResult(item); } catch { setError('Session storage is unavailable.'); } }}>View</button></div>)}</div>}
  </Card>;
}
