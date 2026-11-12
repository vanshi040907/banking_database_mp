import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, useApi } from '@shared/api.js';
import { Alert, Button, Card, Field, Input, PageHeader, Select } from '@shared/ui.jsx';

const accountFromId = value => {
  const normalized = value.trim().toLowerCase();
  return /^\d{6,20}@inkwell$/.test(normalized) ? normalized.split('@')[0] : /^\d{6,20}$/.test(normalized) ? normalized : null;
};

export default function Transfer() {
  const { data, reload, error: accountsError } = useApi('/customer/accounts');
  const [params] = useSearchParams();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(params.get('to') || '');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [share, setShare] = useState('');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingRequest = useRef(null);
  const accounts = (data?.accounts || []).filter(account => account.status === 'ACTIVE');

  useEffect(() => {
    if (!share) { setQr(''); return; }
    let current = true;
    const url = window.location.origin + '/transfer?to=' + encodeURIComponent(share + '@inkwell');
    QRCode.toDataURL(url, { width: 240, margin: 2 })
      .then(image => { if (current) setQr(image); })
      .catch(() => { if (current) setQr(''); });
    return () => { current = false; };
  }, [share]);

  async function send(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const target = accountFromId(to);
    if (!target) { setError('Enter an Inkwell account number or internal ID ending @inkwell.'); return; }
    if (target === from) { setError('Choose a different recipient account.'); return; }
    const signature = JSON.stringify({ from, target, amount });
    if (pendingRequest.current?.signature !== signature) {
      pendingRequest.current = { signature, idempotencyKey: crypto.randomUUID() };
    }
    setBusy(true);
    try {
      const result = await api('/customer/transfers', {
        method: 'POST',
        signOutOnUnauthorized: false,
        body: {
          fromAccNo: from, toAccNo: target, amount, remarks: 'Internal payment',
          transactionPin: pin, idempotencyKey: pendingRequest.current.idempotencyKey,
        },
      });
      pendingRequest.current = null;
      setSuccess('Payment recorded. Transaction #' + result.transactionId + '.');
      setAmount('');
      reload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
      setPin('');
    }
  }

  return <div className="max-w-xl">
    <PageHeader title="Send demo credits" subtitle="Instant internal payments between accounts in this database." />
    <Alert tone="info">Internal demo only. An ID ending @inkwell and its QR code work inside this site; they are not real UPI IDs. No external money moves.</Alert>
    <Card className="p-6 mt-5">
      <h2 className="text-xl font-semibold mb-4">Send payment</h2>
      <form onSubmit={send} className="space-y-4">
        <Field label="Your account"><Select value={from} onChange={event => setFrom(event.target.value)} required>
          <option value="">Select an account</option>
          {accounts.map(account => <option key={account.accountNumber} value={account.accountNumber}>{account.accountNumber} — {account.balance} demo credits</option>)}
        </Select></Field>
        <Field label="Recipient internal ID or account number" hint="Example: 1000000003@inkwell">
          <Input value={to} onChange={event => setTo(event.target.value)} required />
        </Field>
        <Field label="Amount in demo credits"><Input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required /></Field>
        <Field label="Transaction PIN"><Input type="password" value={pin} onChange={event => setPin(event.target.value)} inputMode="numeric" maxLength={6} autoComplete="off" required /></Field>
        {error === 'Set up a transaction PIN first' && <p className="text-sm"><Link className="underline" to="/security">Set up your PIN in Security</Link></p>}
        <Alert>{accountsError || error}</Alert><Alert tone="ok">{success}</Alert>
        <Button type="submit" loading={busy}>Send demo credits</Button>
      </form>
    </Card>
    <Card className="p-6 mt-5">
      <h2 className="text-xl font-semibold mb-4">Receive with QR</h2>
      <Field label="Your account"><Select value={share} onChange={event => setShare(event.target.value)}>
        <option value="">Select an account</option>
        {accounts.map(account => <option key={account.accountNumber} value={account.accountNumber}>{account.accountNumber}</option>)}
      </Select></Field>
      {share && <div className="mt-4">
        <p className="text-sm">Your internal ID: <strong>{share}@inkwell</strong></p>
        {qr && <img className="mt-3" src={qr} alt={'QR code for internal account ' + share} width="240" height="240" />}
      </div>}
    </Card>
  </div>;
}
