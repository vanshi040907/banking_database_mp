import { useState } from 'react';
import { api } from './api.js';
import { Art } from './Art.jsx';
import { Alert, Button, Field, Input, OtpInput, Wordmark, useAction } from './ui.jsx';
import { BRAND } from './brand.js';

// Two steps in one screen: credentials, then the one-time code.
// The illustration sits in its own column, never behind the form.
export default function LoginScreen({ art, artWidth = '54%', audience, sub, idLabel, idPlaceholder, idHint, idField, loginPath, verifyPath, onToken, hints }) {
  const [step, setStep] = useState('creds');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null);
  const a = useAction();

  const submit = (e) => {
    e.preventDefault();
    a.run(async () => {
      const r = await api(loginPath, { method: 'POST', body: { [idField]: id.trim(), password } });
      setChallenge(r); setStep('otp');
    });
  };
  const verify = (otp) => a.run(async () => {
    const r = await api(verifyPath, { method: 'POST', body: { challenge_id: challenge.challenge_id, otp } });
    await onToken(r.token);
  });

  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden shrink-0 lg:block" style={{ width: artWidth }}>
        <Art name={art} fade="r b" fadeSize={10} className="absolute inset-0" imgClassName="object-cover object-left-top" />
      </div>

      <main className="flex flex-1 flex-col px-8 py-8 sm:px-12">
        <Wordmark sub={sub} />
        <div className="m-auto w-full max-w-[400px] py-10">
          {step === 'creds' ? (
            <form onSubmit={submit} className="soft-in">
              <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">{audience}</p>
              <h1 className="text-[40px] leading-[1.1]">Welcome back.</h1>
              <p className="mt-2 mb-8 text-ink-400">{BRAND.tagline}</p>
              <div className="space-y-5">
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
          ) : (
            <div className="soft-in">
              <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">Verification</p>
              <h1 className="text-[36px] leading-[1.1]">Hello, {challenge.name}.</h1>
              <p className="mt-2 mb-7 text-ink-400">We sent a six-digit code to {challenge.sent_to}. It stays valid for five minutes.</p>
              <OtpInput onComplete={verify} disabled={a.busy} />
              <div className="mt-5 min-h-[44px]"><Alert>{a.error}</Alert></div>
              {challenge.dev_otp && (
                <p className="mt-2 rounded-lg bg-violet-50 px-3.5 py-2.5 text-[13px] text-violet-700">
                  Development mode: your code is <span className="tnum font-semibold">{challenge.dev_otp}</span> (also printed in the backend terminal).
                </p>
              )}
              <button className="mt-6 text-[14px] text-ink-500 underline underline-offset-4 hover:text-ink-800" onClick={() => { setStep('creds'); a.setError(''); }}>
                Use a different account
              </button>
            </div>
          )}
        </div>
        <p className="text-[12.5px] text-ink-300">© {new Date().getFullYear()} {BRAND.name}. A DBIS minor project.</p>
      </main>
    </div>
  );
}
