import { useState } from 'react';
import { useApi } from '@shared/api.js';
import { Card, EmptyState, ErrorNote, KV, Loading, Modal, PageHeader, Progress, StatusBadge, Table } from '@shared/ui.jsx';
import { fmtDate, inr, titleCase } from '@shared/format.js';

const progress = (fd) => {
  const s = new Date(fd.startDate).getTime(), e = new Date(fd.maturityDate).getTime();
  return e > s ? ((Date.now() - s) / (e - s)) * 100 : 100;
};

function FdDetail({ fd, onClose }) {
  const { data, error, loading, reload } = useApi(`/customer/fixed-deposits/${fd.fdId}/payouts`);
  return (
    <Modal open onClose={onClose} title={`Fixed deposit #${fd.fdId}`} width={560}>
      <dl className="mb-5">
        <KV k="Status" v={<StatusBadge status={fd.status} />} />
        <KV k="Principal" v={inr(fd.principalAmount)} />
        <KV k="Interest rate" v={`${fd.interestRate}% a year`} />
        <KV k="Duration" v={`${fd.durationMonths} months`} />
        <KV k="Started" v={fmtDate(fd.startDate)} />
        <KV k="Matures" v={fmtDate(fd.maturityDate)} />
        <KV k="Estimated interest" v={inr(fd.estimatedInterest)} />
        <KV k="Estimated maturity amount" v={inr(fd.estimatedMaturityAmount)} />
        <KV k="Payout" v={titleCase(fd.payoutType)} />
        <KV k="Linked account" v={`••${fd.linkedAccount.slice(-4)}`} />
      </dl>
      <h3 className="mb-2 text-[17px]">Payouts received</h3>
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {loading && !data && <Loading />}
      {data && <Table dense rowKey="payoutId" rows={data.payouts} empty={<EmptyState title="No payouts yet" />} columns={[
        { key: 'payoutDate', label: 'Date', render: (p) => fmtDate(p.payoutDate) },
        { key: 'payoutType', label: 'Type', render: (p) => titleCase(p.payoutType) },
        { key: 'amount', label: 'Amount', align: 'right', render: (p) => inr(p.amount) },
      ]} />}
    </Modal>
  );
}

export default function Deposits() {
  const fds = useApi('/customer/fixed-deposits');
  const cash = useApi('/customer/deposits');
  const [open, setOpen] = useState(null);
  const list = fds.data?.fixedDeposits ?? [];
  return (
    <div className="soft-in space-y-10">
      <section>
        <PageHeader title="Fixed deposits" subtitle="Money set aside to grow, with the date it matures." />
        {fds.error && <ErrorNote onRetry={fds.reload}>{fds.error}</ErrorNote>}
        {fds.loading && !fds.data && <Loading />}
        {fds.data && !list.length && <Card><EmptyState title="No fixed deposits">Visit your branch to open one. It will appear here with its maturity date.</EmptyState></Card>}
        <div className="grid gap-5 md:grid-cols-2">
          {list.map((fd) => (
            <Card key={fd.fdId} className="cursor-pointer p-6 transition hover:border-ink-200" onClick={() => setOpen(fd)}>
              <div className="flex items-center justify-between"><span className="text-[13px] text-ink-400">FD #{fd.fdId} · {fd.interestRate}%</span><StatusBadge status={fd.status} /></div>
              <div className="serif tnum mt-3 text-[34px] text-ink-900">{inr(fd.principalAmount)}</div>
              <div className="text-[13.5px] text-ink-400">grows to {inr(fd.estimatedMaturityAmount)} on {fmtDate(fd.maturityDate)}</div>
              <Progress className="mt-4" value={fd.status === 'ACTIVE' ? progress(fd) : 100} />
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-[24px]">Cash deposits</h2>
        {cash.error && <ErrorNote onRetry={cash.reload}>{cash.error}</ErrorNote>}
        {cash.loading && !cash.data && <Loading />}
        {cash.data && <Card><Table rowKey="transactionId" rows={cash.data.deposits} empty={<EmptyState title="No cash deposits" />} columns={[
          { key: 'transactionDate', label: 'Date', render: (d) => fmtDate(d.transactionDate) },
          { key: 'referenceNumber', label: 'Reference' },
          { key: 'accountNumber', label: 'Account', render: (d) => `••${d.accountNumber.slice(-4)}` },
          { key: 'amount', label: 'Amount', align: 'right', render: (d) => inr(d.amount) },
          { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
        ]} /></Card>}
      </section>
      {open && <FdDetail fd={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
