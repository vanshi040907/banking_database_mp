import { Link } from 'react-router-dom';
import { useApi } from '@shared/api.js';
import { Art } from '@shared/Art.jsx';
import { Badge, Button, Card, ErrorNote, Loading, Money, SectionTitle, StatusBadge } from '@shared/ui.jsx';
import { greeting, groupAcc, inr, titleCase } from '@shared/format.js';

const Soon = ({ title, text }) => (
  <Card className="border-dashed p-6">
    <div className="mb-1 flex items-center justify-between"><h2 className="text-[21px]">{title}</h2><Badge tone="violet">Coming soon</Badge></div>
    <p className="text-[14px] text-ink-400">{text}</p>
  </Card>
);

export default function Dashboard() {
  const { data, error, loading, reload } = useApi('/customer/accounts');
  const accounts = data?.accounts;
  const total = accounts?.reduce((s, a) => s + Number(a.balance), 0) ?? 0;

  return (
    <div>
      {/* hero: words on the left, scenery in its own space on the right */}
      <section className="relative mb-10 min-h-[150px]">
        <Art name="horizon" fade="l" fadeSize={30} className="absolute right-0 top-0 hidden w-[60%] max-w-[820px] lg:block" />
        <div className="soft-in relative max-w-[460px] pt-3">
          <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-[44px] leading-[1.08]">{greeting()}.<br />Here is where<br />things stand.</h1>
        </div>
      </section>

      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {loading && !accounts && <Loading />}
      {accounts && (
        <div className="soft-in-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <Card className="flex flex-wrap items-end justify-between gap-6 p-7">
              <div>
                <div className="text-[13px] font-medium text-ink-400">Total balance</div>
                <div className="serif tnum mt-1 text-[52px] leading-none text-ink-900">{inr(total)}</div>
                <div className="mt-2 text-[14px] text-ink-400">Across {data.totalAccounts} account{data.totalAccounts === 1 ? '' : 's'}</div>
              </div>
              <Link to="/transfer"><Button>Send money</Button></Link>
            </Card>

            <section>
              <SectionTitle>Accounts</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                {accounts.map((a) => (
                  <Link key={a.accountNumber} to={`/accounts/${a.accountNumber}`}>
                    <Card className="h-full p-5 transition hover:border-ink-200 hover:shadow-[0_4px_16px_rgba(20,27,74,0.07)]">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-[13px] font-medium text-ink-500">{titleCase(a.accountType)}</span>
                        <span className="flex gap-1.5">{a.isPrimary && <Badge tone="violet">Primary</Badge>}{a.status !== 'ACTIVE' && <StatusBadge status={a.status} />}</span>
                      </div>
                      <Money value={a.balance} className="serif text-[28px] text-ink-900" />
                      <div className="mt-1 text-[13px] text-ink-400 tnum">{groupAcc(a.accountNumber)} · {a.branchName}</div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          </div>
          <aside className="space-y-6">
            <Soon title="Recent activity" text="Your latest payments and deposits will appear here once transaction history is ready." />
            <Soon title="Savings" text="A picture of money in versus money out over the week, month and year." />
          </aside>
        </div>
      )}
    </div>
  );
}
