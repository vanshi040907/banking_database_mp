import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import { Badge, Card, SectionTitle } from '@shared/ui.jsx';
import { greeting } from '@shared/format.js';
import { SOON } from '../soon.js';

const Check = () => <span className="grid h-6 w-6 place-items-center rounded-full bg-ok-50 text-[13px] text-ok-600" aria-hidden="true">✓</span>;

export default function Overview() {
  const { user } = useAuth();
  return (
    <div className="soft-in">
      <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">Employee {user.id}</p>
      <h1 className="mb-2 text-[38px] leading-tight">{greeting()}.</h1>
      <p className="mb-9 max-w-[560px] text-ink-400">Your staff workspace is being built one screen at a time. What already works is listed below, and everything else is marked Soon in the menu.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle>Ready now</SectionTitle>
          <ul className="space-y-3.5 text-[15px]">
            {[['Secure sign-in', 'Employee ID, password and a one-time code'], ['Password change', 'Forced on a temporary password, or any time from Security'], ['Cards', 'Issue debit and credit cards and set daily limits']].map(([t, d]) => (
              <li key={t} className="flex items-start gap-3"><Check /><div><div className="font-medium text-ink-900">{t}</div><div className="text-[13.5px] text-ink-400">{d}</div></div></li>
            ))}
          </ul>
        </Card>
        <Card className="p-6">
          <SectionTitle>Coming next</SectionTitle>
          <ul className="space-y-1">
            {Object.values(SOON).map((s) => (
              <li key={s.path}><Link to={s.path} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-violet-50">
                <span className="text-[15px] text-ink-800">{s.label}</span><Badge tone="violet">Soon</Badge></Link></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
