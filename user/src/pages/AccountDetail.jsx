import { Link, useParams } from 'react-router-dom';
import { useApi } from '@shared/api.js';
import { Badge, Card, ErrorNote, KV, Loading, Money, StatusBadge } from '@shared/ui.jsx';
import { fmtDate, groupAcc, titleCase } from '@shared/format.js';

export default function AccountDetail() {
  const { acc } = useParams();
  const { data, error, reload } = useApi('/customer/accounts');
  if (error) return <ErrorNote onRetry={reload}>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const a = data.accounts.find((x) => x.accountNumber === acc);
  if (!a) return <ErrorNote>We could not find that account.</ErrorNote>;

  return (
    <div className="soft-in">
      <Link to="/" className="mb-5 inline-block text-[14px] text-ink-400 hover:text-ink-800">← Overview</Link>
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2"><span className="text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">{titleCase(a.accountType)} account</span>
          {a.isPrimary && <Badge tone="violet">Primary</Badge>}<StatusBadge status={a.status} /></div>
        <div className="serif tnum text-[56px] leading-none text-ink-900"><Money value={a.balance} /></div>
        <div className="mt-2 text-[14px] text-ink-400 tnum">{groupAcc(a.accountNumber)} · {a.branchName}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="border-dashed p-7">
          <div className="mb-1 flex items-center justify-between"><h2 className="text-[21px]">Transactions</h2><Badge tone="violet">Coming soon</Badge></div>
          <p className="max-w-[460px] text-[14.5px] text-ink-400">Every payment in and out of this account will be listed here, with search and filters, as soon as transaction history is ready.</p>
        </Card>
        <Card className="px-6 py-3">
          <dl>
            <KV k="Account number" v={<span className="tnum">{groupAcc(a.accountNumber)}</span>} />
            <KV k="Type" v={titleCase(a.accountType)} />
            <KV k="Branch" v={a.branchName} />
            <KV k="IFSC" v={<span className="tnum">{a.ifscCode}</span>} />
            <KV k="Opened" v={fmtDate(a.openingDate)} />
            <KV k="Status" v={<StatusBadge status={a.status} />} />
          </dl>
        </Card>
      </div>
    </div>
  );
}
