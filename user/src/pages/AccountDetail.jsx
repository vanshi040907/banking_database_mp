import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useApi } from '@shared/api.js';
import { Badge, Button, Card, EmptyState, ErrorNote, KV, Loading, Money, Segmented, SectionTitle, StatusBadge, useAction, useToast } from '@shared/ui.jsx';
import { fmtDate, groupAcc, inr, titleCase } from '@shared/format.js';
import { TxnList } from '../txn.jsx';

const PAGE = 15;

export default function AccountDetail() {
  const { acc } = useParams();
  const toast = useToast();
  const { data: a, error, reload } = useApi(`/customer/accounts/${acc}`);
  const { data: sum } = useApi(`/customer/accounts/${acc}/summary`);
  const [dir, setDir] = useState('ALL');
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const act = useAction();

  const load = useCallback(async (offset = 0) => {
    const q = `limit=${PAGE}&offset=${offset}${dir === 'ALL' ? '' : `&direction=${dir}`}`;
    const r = await api(`/customer/accounts/${acc}/transactions?${q}`);
    setRows((prev) => (offset ? [...prev, ...r] : r));
    setMore(r.length === PAGE);
  }, [acc, dir]);
  useEffect(() => { setRows(null); load(0).catch(() => setRows([])); }, [load]);

  const makePrimary = () => act.run(async () => {
    await api('/customer/primary', { method: 'POST', body: { acc_no: acc } });
    toast('This is now your primary account'); reload();
  });

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!a) return <Loading />;

  return (
    <div className="soft-in">
      <Link to="/" className="mb-5 inline-block text-[14px] text-ink-400 hover:text-ink-800">← Overview</Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">{titleCase(a.type_name)} account</span>
            {a.is_primary ? <Badge tone="violet">Primary</Badge> : null}<StatusBadge status={a.status} /></div>
          <div className="serif tnum text-[56px] leading-none text-ink-900">{inr(a.balance)}</div>
          <div className="mt-2 text-[14px] text-ink-400 tnum">{groupAcc(a.acc_no)} · {a.branch_name}</div>
        </div>
        <div className="flex gap-2.5">
          {!a.is_primary && a.status === 'ACTIVE' && <Button variant="secondary" loading={act.busy} onClick={makePrimary}>Make primary</Button>}
          <Link to="/transfer" state={{ from: a.acc_no }}><Button>Send money</Button></Link>
        </div>
      </div>
      {act.error && <ErrorNote>{act.error}</ErrorNote>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[21px]">Transactions</h2>
            <Segmented value={dir} onChange={setDir} options={[['ALL', 'All'], ['CREDIT', 'Money in'], ['DEBIT', 'Money out']]} />
          </div>
          <Card>
            {rows === null ? <Loading /> : rows.length ? <TxnList items={rows} /> : <EmptyState title="No transactions">Nothing matches this view yet.</EmptyState>}
          </Card>
          {more && <div className="mt-4 text-center"><Button variant="secondary" onClick={() => load(rows.length)}>Show more</Button></div>}
        </section>

        <aside className="space-y-6">
          <Card className="p-6">
            <SectionTitle>Savings</SectionTitle>
            {sum ? [['week', 'Last 7 days'], ['month', 'Last 30 days'], ['year', 'Last year']].map(([k, l]) => (
              <div key={k} className="border-b border-line/70 py-3 last:border-0">
                <div className="flex items-baseline justify-between"><span className="text-[13.5px] text-ink-400">{l}</span>
                  <Money value={sum[k].saved} className="serif text-[20px] text-ink-900" /></div>
                <div className="mt-0.5 flex justify-between text-[12.5px] text-ink-400"><span>In <Money value={sum[k].credits} /></span><span>Out <Money value={sum[k].debits} /></span></div>
              </div>
            )) : <Loading />}
          </Card>
          <Card className="px-6 py-3">
            <dl>
              <KV k="Opened" v={fmtDate(a.creation_date)} />
              <KV k="Branch" v={a.branch_name} />
              <KV k="IFSC" v={<span className="tnum">{a.branch_ifsc}</span>} />
              <KV k="Minimum balance" v={inr(a.min_balance)} />
              <KV k="Interest rate" v={`${Number(a.interest_rate).toFixed(2)}% a year`} />
              <KV k="Daily limit" v={inr(a.daily_txn_limit)} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
