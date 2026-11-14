import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { Alert, Button, Field, Input, Segmented, Select, useAction, useToast } from '@shared/ui.jsx';

const pinOnly = (s) => s.replace(/\D/g, '').slice(0, 6);

export default function TransactionPinForm() {
  const toast = useToast();
  const { data } = useApi('/customer/accounts');
  const accounts = data?.accounts ?? [];
  const [mode, setMode] = useState('setup');
  const [acc, setAcc] = useState('');
  const [password, setPassword] = useState('');
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const act = useAction();
  const account = acc || accounts[0]?.accountNumber || '';

  const submit = (e) => {
    e.preventDefault();
    act.run(async () => {
      const body = mode === 'setup' ? { password, newPin: pin } : { password, currentPin: current, newPin: pin };
      await api(`/customer/accounts/${account}/pin/${mode}`, { method: 'POST', body });
      toast(mode === 'setup' ? 'Transaction PIN set' : 'Transaction PIN changed');
      setPassword(''); setCurrent(''); setPin('');
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <h2 className="text-[22px]">Transaction PIN</h2>
      <p className="text-[14px] text-ink-400">A 6-digit PIN confirms every payment you send. Each account has its own.</p>
      <Segmented value={mode} onChange={setMode} options={[['setup', 'Set up'], ['change', 'Change']]} />
      <Field label="Account">
        <Select value={account} onChange={(e) => setAcc(e.target.value)}>
          {accounts.map((a) => <option key={a.accountNumber} value={a.accountNumber}>••{a.accountNumber.slice(-4)}</option>)}
        </Select>
      </Field>
      <Field label="Your password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
      {mode === 'change' && <Field label="Current PIN"><Input type="password" value={current} onChange={(e) => setCurrent(pinOnly(e.target.value))} inputMode="numeric" autoComplete="off" required /></Field>}
      <Field label="New PIN"><Input type="password" value={pin} onChange={(e) => setPin(pinOnly(e.target.value))} inputMode="numeric" autoComplete="off" required /></Field>
      <Alert>{act.error}</Alert>
      <Button type="submit" loading={act.busy} disabled={!account || !password || pin.length !== 6 || (mode === 'change' && current.length !== 6)} className="w-full">{mode === 'setup' ? 'Set PIN' : 'Change PIN'}</Button>
    </form>
  );
}
