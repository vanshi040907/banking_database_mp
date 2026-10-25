import { useApi } from '@shared/api.js';
import { Card, EmptyState, ErrorNote, Loading, Money, PageHeader, Progress, StatusBadge } from '@shared/ui.jsx';
import { fmtDate, titleCase } from '@shared/format.js';

const progress = (s, e) => {
  const a = new Date(`${s}T00:00:00`), b = new Date(`${e}T00:00:00`);
  return Math.max(0, Math.min(100, ((Date.now() - a) / (b - a)) * 100));
};

export default function Deposits() {
  const { data, error, reload } = useApi('/customer/deposits');
  const total = data?.filter((f) => f.status === 'ACTIVE').reduce((s, f) => s + Number(f.amount), 0) ?? 0;
  return (
    <div className="soft-in">
      <PageHeader title="Fixed deposits" subtitle="Money set aside to grow, with the date it matures." />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <Card className="mb-6 flex items-end justify-between p-7">
            <div><div className="text-[13px] font-medium text-ink-400">Currently invested</div><Money value={total} className="serif text-[44px] leading-tight text-ink-900" /></div>
            <div className="text-[14px] text-ink-400">{data.filter((f) => f.status === 'ACTIVE').length} active deposits</div>
          </Card>
          {!data.length && <Card><EmptyState title="No fixed deposits">Open one at your branch to start earning a fixed rate.</EmptyState></Card>}
          <div className="space-y-4">
            {data.map((f) => (
              <Card key={f.fd_id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2"><span className="text-[13px] font-medium uppercase tracking-[0.1em] text-violet-600">FD #{f.fd_id}</span><StatusBadge status={f.status} /></div>
                    <Money value={f.amount} className="serif text-[30px] text-ink-900" />
                  </div>
                  <div className="text-right"><div className="text-[13px] text-ink-400">Interest rate</div><div className="serif text-[26px] text-ink-800">{Number(f.int_rate_fd).toFixed(2)}%</div></div>
                </div>
                <Progress value={progress(f.start_date, f.maturity_date)} className="mb-2 mt-5" />
                <div className="flex justify-between text-[13px] text-ink-400"><span>{fmtDate(f.start_date)}</span><span>Matures {fmtDate(f.maturity_date)}</span></div>
                <div className="mt-4 grid gap-4 border-t border-line pt-4 text-[14px] sm:grid-cols-3">
                  <div><div className="text-ink-400">Term</div>{f.duration_months} months</div>
                  <div><div className="text-ink-400">Payout</div>{titleCase(f.payout_type)}</div>
                  <div><div className="text-ink-400">{f.payout_type === 'AT_MATURITY' ? 'Expected at maturity' : 'Interest paid so far'}</div>
                    <Money value={f.payout_type === 'AT_MATURITY' ? f.maturity_amount : f.paid_out} className="font-medium" /></div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
