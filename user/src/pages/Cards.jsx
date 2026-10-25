import { useApi } from '@shared/api.js';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, StatusBadge } from '@shared/ui.jsx';
import { fmtDate, groupAcc, inrShort, titleCase } from '@shared/format.js';

export default function Cards() {
  const { data, error, reload } = useApi('/customer/cards');
  return (
    <div className="soft-in">
      <PageHeader title="Cards" subtitle="Your debit and credit cards, with limits and status." />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {!data && !error && <Loading />}
      {data && !data.length && <Card><EmptyState title="No cards yet">Visit your branch to request a debit or credit card.</EmptyState></Card>}
      <div className="grid gap-5 md:grid-cols-2">
        {data?.map((c) => {
          const off = c.status !== 'ACTIVE';
          return (
            <Card key={c.card_id} className={`relative overflow-hidden p-7 ${off ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between">
                <span className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-violet-600">{titleCase(c.card_type)} card</span>
                <StatusBadge status={c.status} />
              </div>
              <div className="serif tnum mt-10 text-[28px] tracking-[0.06em] text-ink-900">{c.card_no.replace(/X/g, '•')}</div>
              <div className="mt-8 flex items-end justify-between text-[13.5px]">
                <div><div className="text-ink-400">Expires</div><div className="tnum font-medium text-ink-800">{fmtDate(c.expiry_date)}</div></div>
                <div><div className="text-ink-400">Daily limit</div><div className="tnum font-medium text-ink-800">{inrShort(c.daily_limit)}</div></div>
                <div className="text-right"><div className="text-ink-400">Linked account</div><div className="tnum font-medium text-ink-800">{groupAcc(c.acc_no).slice(-9)}</div></div>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-ink-700 via-violet-400 to-transparent opacity-60" />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
