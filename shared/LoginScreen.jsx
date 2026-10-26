import { useState } from 'react';
import { api } from './api.js';
import { Art } from './Art.jsx';
import PasswordForm from './PasswordForm.jsx';
import { Alert, Button, Field, Input, OtpInput, Wordmark, useAction } from './ui.jsx';
import { BRAND } from './brand.js';

// Steps, following the backend: 1) id + password -> otpToken, 2) otp -> login token,
// 3) if the account still has a temporary password, choose a new one (then sign in again).
// The illustration sits in its own column, never behind the form.
export default function LoginScreen({ art, artWidth = '54%', audience, sub, idLabel, idPlaceholder, idHint, idField, loginPath, expectType, wrongPortal, onToken, hints }) {
  const [step, setStep] = useState('creds');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [otpToken, setOtpToken] = useState(null);
  const [pending, setPending] = useState(null); // login token held in memory only, until the password is changed
  const [notice, setNotice] = useState('');
  const a = useAction();

  const submit = (e) => {
    e.preventDefault();
    setNotice('');
    a.run(async () => {
      const r = await api(loginPath, { method: 'POST', body: { [idField]: id.trim(), password } });
      setOtpToken(r.otpToken); setStep('otp');
    });
  };

  const verify = (otp) => a.run(async () => {
    const r = await api('/auth/verify-otp', { method: 'POST', body: { otpToken, otp } });
    if (r.userType !== expectType) throw new Error(wrongPortal);
    if (r.mustChangePassword) { setPending(r.token); setStep('newpass'); return; }
    await onToken(r.token);
  });

  const back = () => { setStep('creds'); setPassword(''); setPending(null); a.setError(''); };

  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden shrink-0 lg:block" style={{ width: artWidth }}>
        <Art name={art} fade="r b" fadeSize={10} className="absolute inset-0" imgClassName="object-cover object-left-top" />
      </div>

      <main className="flex flex-1 flex-col px-8 py-8 sm:px-12">
        <Wordmark sub={sub} />
        <div className="m-auto w-full max-w-[400px] py-10">
          {step === 'creds' && (
            <form onSubmit={submit} className="soft-in">
              <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">{audience}</p>
              <h1 className="text-[40px] leading-[1.1]">Welcome back.</h1>
              <p className="mt-2 mb-8 text-ink-400">{BRAND.tagline}</p>
              <div className="space-y-5">
                {notice && <Alert tone="ok">{notice}</Alert>}
                <Field label={idLabel} hint={idHint}>
                  <Input autoFocus value={id} onChange={(e) => setId(e.target.value)} placeholder={idPlaceholder} inputMode="numeric" autoComplete="username" required />
                </Field>
                <Field label="Password">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                </Field>
                <Alert>{a.error}</Alert>
                <Button type="submit" loading={a.busy} className="w-full">Continue</Button>
              </div>
              {hints && <div className="mt-8 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-400">{hints}</div>}
            </form>
          )}

          {step === 'otp' && (
            <div className="soft-in">
              <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">Verification</p>
              <h1 className="text-[36px] leading-[1.1]">Check your phone.</h1>
              <p className="mt-2 mb-7 text-ink-400">We sent a six-digit code to your registered mobile number. It stays valid for five minutes.</p>
              <OtpInput onComplete={verify} disabled={a.busy} />
              <div className="mt-5 min-h-[44px]"><Alert>{a.error}</Alert></div>
              <p className="mt-2 rounded-lg bg-violet-50 px-3.5 py-2.5 text-[13px] text-violet-700">
                Development mode: no SMS is sent yet. The code is printed in the backend terminal.
              </p>
              <button className="mt-6 text-[14px] text-ink-500 underline underline-offset-4 hover:text-ink-800" onClick={back}>Start over</button>
            </div>
          )}

          {step === 'newpass' && (
            <div className="soft-in">
              <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">One more step</p>
              <h1 className="text-[36px] leading-[1.1]">Choose a new password.</h1>
              <p className="mt-2 mb-7 text-ink-400">You are signed in with a temporary password. Pick one only you know, then sign in again.</p>
              <PasswordForm current={password} token={pending} submitLabel="Save and continue"
                onDone={() => { setNotice('Password changed. Please sign in again with your new password.'); setStep('creds'); setPassword(''); setPending(null); }} />
              <button className="mt-6 text-[14px] text-ink-500 underline underline-offset-4 hover:text-ink-800" onClick={back}>Cancel</button>
            </div>
          )}
        </div>
        <p className="text-[12.5px] text-ink-300">© {new Date().getFullYear()} {BRAND.name}. A DBIS minor project.</p>
      </main>
    </div>
  );
}
