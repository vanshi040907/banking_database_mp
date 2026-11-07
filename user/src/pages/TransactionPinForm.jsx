import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { Alert, Button, Field, Input, Select } from '@shared/ui.jsx';

export default function TransactionPinForm() {
  const { data, loading, error: accountsError } = useApi('/customer/accounts');
  const [account, setAccount] = useState('');
  const [mode, setMode] = useState('setup');
  const [password, setPassword] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError(''); setSuccess('');
    if (!/^\d{6}$/.test(newPin) || newPin !== confirmPin || (mode === 'change' && !/^\d{6}$/.test(currentPin))) {
      setError('Enter matching six-digit PINs.');
      return;
    }
    setBusy(true);
    try {
      const body = { password, newPin, ...(mode === 'change' ? { currentPin } : {}) };
      const result = await api(`/customer/accounts/${account}/pin/${mode}`, {
        method: 'POST', body, signOutOnUnauthorized: false,
      });
      setSuccess(result.message);
      setPassword(''); setCurrentPin(''); setNewPin(''); setConfirmPin('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-4">
    <h2 className="text-xl font-semibold">Transaction PIN</h2>
    <p className="text-sm text-ink-500">Set a six-digit PIN for the account you use to send money.</p>
    <Field label="Action"><Select value={mode} onChange={e => { setMode(e.target.value); setError(''); setSuccess(''); }}><option value="setup">Set up PIN</option><option value="change">Change existing PIN</option></Select></Field>
    <Field label="Account"><Select value={account} onChange={e => setAccount(e.target.value)} required disabled={loading}><option value="">Select an account</option>{(data?.accounts || []).filter(a => a.status === 'ACTIVE').map(a => <option key={a.accountNumber} value={a.accountNumber}>{a.accountNumber}</option>)}</Select></Field>
    <Field label="Login password"><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
    {mode === 'change' && <Field label="Current transaction PIN"><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" value={currentPin} onChange={e => setCurrentPin(e.target.value)} required /></Field>}
    <Field label="New transaction PIN"><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" value={newPin} onChange={e => setNewPin(e.target.value)} required /></Field>
    <Field label="Confirm new transaction PIN"><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} required /></Field>
    <Alert>{accountsError || error}</Alert><Alert tone="ok">{success}</Alert>
    <Button type="submit" loading={busy} disabled={!account}>{mode === 'setup' ? 'Set up transaction PIN' : 'Change transaction PIN'}</Button>
  </form>;
}
