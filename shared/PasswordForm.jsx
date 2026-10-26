import { useState } from 'react';
import { api } from './api.js';
import { Alert, Button, Field, Input, useAction } from './ui.jsx';

const Rule = ({ ok, children }) => (
  <li className={`flex items-center gap-2 text-[13px] ${ok ? 'text-ok-600' : 'text-ink-400'}`}>
    <span aria-hidden="true">{ok ? '✓' : '○'}</span>{children}
  </li>
);

// Change password. The backend wants 12 to 72 characters, different from the current one.
// `current` skips the "current password" field when we already have it (forced change right after sign-in).
export default function PasswordForm({ current: knownCurrent, token, onDone, submitLabel = 'Update password' }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const a = useAction();
  const current = knownCurrent ?? cur;
  const lenOk = pw.length >= 12 && pw.length <= 72;
  const diffOk = pw.length > 0 && pw !== current;
  const sameOk = pw.length > 0 && pw === again;
  const ready = !!current && lenOk && diffOk && sameOk;

  const submit = (e) => {
    e.preventDefault();
    a.run(async () => {
      const r = await api('/auth/change-password', { method: 'POST', token, body: { currentPassword: current, newPassword: pw } });
      onDone(r.message);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {knownCurrent === undefined && (
        <Field label="Current password"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required /></Field>
      )}
      <Field label="New password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></Field>
      <Field label="Type it again"><Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required /></Field>
      <ul className="space-y-1.5 rounded-lg bg-violet-50 px-4 py-3">
        <Rule ok={lenOk}>12 to 72 characters</Rule>
        <Rule ok={diffOk}>Different from your current password</Rule>
        <Rule ok={sameOk}>Both entries match</Rule>
      </ul>
      <Alert>{a.error}</Alert>
      <Button type="submit" loading={a.busy} disabled={!ready} className="w-full">{submitLabel}</Button>
    </form>
  );
}
