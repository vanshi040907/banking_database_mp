import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '@shared/api.js';
import { Art } from '@shared/Art.jsx';
import { useAuth } from '@shared/auth.jsx';
import { Badge, Button, Card, EmptyState, ErrorNote, Loading, Money, Segmented, SectionTitle, StatusBadge } from '@shared/ui.jsx';
import { greeting, groupAcc, inr, titleCase } from '@shared/format.js';
import { TxnList } from '../txn.jsx';

function Savings({ acc }) {
  const { data } = useApi(`/customer/accounts/${acc}/summary`);
  const [p, setP] = useState('month');
  const s = data?.[p];
  const max = Math.max(s?.credits ?? 0, s?.debits ?? 0, 1);
  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-[21px]">Savings</h2>
          <p className="text-[13px] text-ink-400">Money in versus money out, primary account</p>
        </div>
        <Segmented value={p} onChange={setP} options={[['week', '7 days'], ['month', '30 days'], ['year', 'Year']]} />
      </div>
      {s ? (
        <>
          <div className="serif tnum text-[34px] leading-none text-ink-900">{s.saved >= 0 ? '' : '−'}{inr(Math.abs(s.saved))}</div>
          <div className="mb-5 mt-1 text-[13px] text-ink-400">{s.saved >= 0 ? 'saved' : 'spent beyond income'} in this period</div>
          {[['In', s.credits, 'bg-ink-600'], ['Out', s.debits, 'bg-violet-400']].map(([l, v, c]) => (
            <div key={l} className="mb-3 flex items-center gap-3 last:mb-0">
              <span className="w-8 text-[13px] text-ink-400">{l}</span>
              <div className="h-2 flex-1 rounded-full bg-ink-50"><div className={`h-full rounded-full ${c} transition-all duration-700`} style={{ width: `${(v / max) * 100}%` }} /></div>
              <Money value={v} className="w-28 text-right text-[13.5px] text-ink-700" />
            </div>
          ))}
        </>
      ) : <Loading />}
    </Card>
  );
}

function Recent({ accounts }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    Promise.all(accounts.map((a) => api(`/customer/accounts/${a.acc_no}/transactions?limit=6`)))
      .then((all) => setItems(all.flat().sort((a, b) => b.trans_date.localeCompare(a.trans_date) || b.trans_id - a.trans_id).slice(0, 6)))
      .catch(() => setItems([]));
  }, [accounts]);
  return (
    <Card>
      {items === null ? <Loading /> : items.length ? <TxnList items={items} /> : <EmptyState title="No activity yet">Transactions on your accounts will appear here.</EmptyState>}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: accounts, error, loading, reload } = useApi('/customer/accounts');
  const total = accounts?.reduce((s, a) => s + Number(a.balance), 0) ?? 0;
  const primary = accounts?.find((a) => a.is_primary) ?? accounts?.[0];

  return (
    <div>
      {/* hero: words on the left, scenery in its own space on the right */}
      <section className="relative mb-10 min-h-[150px]">
        <Art name="horizon" fade="l" fadeSize={30} className="absolute right-0 top-0 hidden w-[60%] max-w-[820px] lg:block" />
        <div className="soft-in relative max-w-[460px] pt-3">
          <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-[44px] leading-[1.08]">{greeting()},<br />{user.name.split(' ')[0]}.</h1>
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
                <div className="mt-2 text-[14px] text-ink-400">Across {accounts.length} account{accounts.length === 1 ? '' : 's'}</div>
              </div>
              <Link to="/transfer"><Button>Send money</Button></Link>
            </Card>

            <section>
              <SectionTitle>Accounts</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                {accounts.map((a) => (
                  <Link key={a.acc_no} to={`/accounts/${a.acc_no}`}>
                    <Card className="h-full p-5 transition hover:border-ink-200 hover:shadow-[0_4px_16px_rgba(20,27,74,0.07)]">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-[13px] font-medium text-ink-500">{titleCase(a.type_name)}</span>
                        <span className="flex gap-1.5">{a.is_primary ? <Badge tone="violet">Primary</Badge> : null}{a.status !== 'ACTIVE' && <StatusBadge status={a.status} />}</span>
                      </div>
                      <Money value={a.balance} className="serif text-[28px] text-ink-900" />
                      <div className="mt-1 text-[13px] text-ink-400 tnum">{groupAcc(a.acc_no)} · {a.branch_name}</div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle>Recent activity</SectionTitle>
              <Recent accounts={accounts} />
            </section>
          </div>
          <aside className="space-y-6">{primary && <Savings acc={primary.acc_no} />}</aside>
        </div>
      )}
    </div>
  );
}
