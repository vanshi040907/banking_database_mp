import { useState } from 'react';
import { api } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';
import { Alert, Button, Card, Field, Input } from '@shared/ui.jsx';

const initial = { name: '', phone: '', email: '', amount: '', vpa: '' };
function readSaved(key) { try { return JSON.parse(sessionStorage.getItem(key)) || null; } catch { return null; } }
function save(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep state in memory. */ } }

export default function SandboxPhonePayout() {
  const { user } = useAuth();
  const key = 'inkwell.cashfree.upi.sandbox.' + user.id;
  const [saved, setSaved] = useState(() => readSaved(key));
  const [fields, setFields] = useState(() => readSaved(key)?.fields || initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function set(field, value) { setFields(previous => ({ ...previous, [field]: value })); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const same = saved && JSON.stringify(saved.fields) === JSON.stringify(fields);
    const request = same ? saved : { requestId: crypto.randomUUID(), fields, result: null };
    save(key, request); setSaved(request);
    try {
      const result = await api('/customer/sandbox-upi-payouts', { method: 'POST', body: { requestId: request.requestId, ...fields } });
      const next = { ...request, result }; save(key, next); setSaved(next);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function refresh() {
    if (!saved?.result?.id) return;
    setBusy(true); setError('');
    try { const result = await api(`/customer/sandbox-upi-payouts/${saved.result.id}`); const next = { ...saved, result }; save(key, next); setSaved(next); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="mt-8">
    <h2 className="mb-2 text-[24px]">Cashfree UPI payout test</h2>
    <p className="mb-4 text-[14px] text-ink-500">Cashfree test environment only. Use Cashfree test data. Provide a test UPI ID; this is a separate simulated business payout; it does not debit an account in this portal.</p>
    <Card className="p-6"><form onSubmit={submit} className="space-y-4">
      <Field label="Test UPI ID"><Input value={fields.vpa} onChange={e => set('vpa', e.target.value)} placeholder="success@upi" required /></Field>
      <Field label="Recipient name"><Input value={fields.name} onChange={e => set('name', e.target.value)} required /></Field>
      <Field label="Test phone number"><Input value={fields.phone} onChange={e => set('phone', e.target.value)} inputMode="numeric" pattern="[0-9]{10}" required /></Field>
      <Field label="Test email"><Input type="email" value={fields.email} onChange={e => set('email', e.target.value)} required /></Field>
      <Field label="Amount (INR)"><Input value={fields.amount} onChange={e => set('amount', e.target.value)} inputMode="decimal" required /></Field>
      <Alert>{error}</Alert>
      <div className="flex flex-wrap gap-3"><Button type="submit" loading={busy}>Submit test payout</Button>{saved?.result?.id && <Button type="button" variant="secondary" onClick={refresh} disabled={busy}>Check status</Button>}</div>
    </form></Card>
    {saved?.result && <Alert tone="info" className="mt-4">Test payout {saved.result.id}: {saved.result.status}{saved.result.reasonCode ? ` (${saved.result.reasonCode})` : null}. Pending or unknown means the outcome is not confirmed.</Alert>}
    <p className="mt-4 text-[14px] text-ink-500">Phone-number payouts are unavailable: Cashfree has retired the documented phone payout API. A phone number cannot be used as a UPI ID.</p>
  </section>;
}
