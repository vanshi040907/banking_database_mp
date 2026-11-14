import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '@shared/api.js';
import { Badge, Button, Card, ErrorNote, KV, Loading, Money, StatusBadge } from '@shared/ui.jsx';
import { fmtDate, fmtDateTime, inr, groupAcc, titleCase } from '@shared/format.js';

export default function AccountDetail() {
  const { acc } = useParams();
  const { data, error, reload } = useApi('/customer/accounts');
  const [page, setPage] = useState(1);
  const history = useApi(`/customer/accounts/${acc}/transactions?page=${page}`);
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
        <Card className="p-7">
          <h2 className="mb-4 text-[21px]">Transactions</h2>
          {history.error && <ErrorNote onRetry={history.reload}>{history.error}</ErrorNote>}
          {history.loading && !history.data && <Loading />}
          {history.data && !history.data.transactions.length && !history.data.failedPayments.length && <p className="text-[14.5px] text-ink-400">No payments yet.</p>}
          <div className="divide-y divide-line">
            {history.data?.transactions.map((t) => (
              <div key={t.transactionId} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{t.direction === 'DEBIT' ? 'Sent' : 'Received'} · {titleCase(t.mode)}</p>
                  <p className="text-[13.5px] text-ink-400">{t.counterpartyAccount ? `Account ${t.counterpartyAccount}` : titleCase(t.type)} · {fmtDateTime(t.date)}</p>
                  {t.remarks && <p className="text-[13px] text-ink-400">{t.remarks}</p>}
                </div>
                <div className="text-right">
                  <p className="tnum font-medium">{t.direction === 'DEBIT' ? '−' : '+'}{inr(t.amount)}</p>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))}
          </div>
          {history.data?.failedPayments.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="mb-1 text-[16px] font-semibold">Failed payment attempts</h3>
              <p className="mb-2 text-[13px] text-ink-400">No money moved for these.</p>
              {history.data.failedPayments.map((f) => (
                <div key={f.attemptId} className="flex items-start justify-between gap-4 py-2.5">
                  <div><p className="font-medium">To account {f.recipientAccount}</p><p className="text-[13.5px] text-ink-400">{f.reason} · {fmtDateTime(f.date)}</p></div>
                  <p className="tnum font-medium">{inr(f.amount)}</p>
                </div>
              ))}
            </div>
          )}
          {history.data?.pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
              <span className="text-[13.5px] text-ink-400">Page {page} of {history.data.pagination.totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= history.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Older</Button>
            </div>
          )}
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
