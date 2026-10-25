import { useState } from 'react';
import { useApi } from '@shared/api.js';
import { Button, Card, EmptyState, ErrorNote, Loading, Money, PageHeader, Progress, StatusBadge, Table } from '@shared/ui.jsx';
import { fmtDate, titleCase } from '@shared/format.js';

function Schedule({ id }) {
  const { data, error } = useApi(`/customer/loans/${id}/schedule`);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  return (
    <Table dense rowKey="installment_no" rows={data} columns={[
      { key: 'installment_no', label: '#' },
      { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
      { key: 'principal_part', label: 'Principal', align: 'right', render: (r) => <Money value={r.principal_part} /> },
      { key: 'interest_part', label: 'Interest', align: 'right', render: (r) => <Money value={r.interest_part} /> },
      { key: 'emi_amount', label: 'EMI', align: 'right', render: (r) => <Money value={r.emi_amount} className="font-medium" /> },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    ]} />
  );
}

export default function Loans() {
  const { data, error, reload } = useApi('/customer/loans');
  const [open, setOpen] = useState(null);
  return (
    <div className="soft-in">
      <PageHeader title="Loans" subtitle="What you owe, what is next, and how far along you are." />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {!data && !error && <Loading />}
      {data && !data.length && <Card><EmptyState title="No loans">You have no active loans with us.</EmptyState></Card>}
      <div className="space-y-5">
        {data?.map((l) => {
          const pct = (l.paid_installments / l.tenure_months) * 100;
          return (
            <Card key={l.loan_id} className="p-7">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <div className="mb-1 flex items-center gap-2"><span className="text-[13px] font-medium uppercase tracking-[0.1em] text-violet-600">{titleCase(l.loantype)} loan</span><StatusBadge status={l.status} /></div>
                  <div className="text-[13px] text-ink-400">Outstanding</div>
                  <Money value={l.outstanding_amount} className="serif text-[40px] leading-tight text-ink-900" />
                </div>
                {l.next_emi && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 px-5 py-3 text-right">
                    <div className="text-[13px] text-violet-700">Next EMI · {fmtDate(l.next_emi.due_date)}</div>
                    <Money value={l.next_emi.emi_amount} className="serif text-[26px] text-ink-900" />
                  </div>
                )}
              </div>
              <Progress value={pct} className="mb-2 mt-6" />
              <div className="flex justify-between text-[13px] text-ink-400"><span>{l.paid_installments} of {l.tenure_months} installments paid</span><span>Borrowed <Money value={l.principle_amt} /> at {Number(l.int_rate).toFixed(2)}%</span></div>
              <div className="mt-5"><Button variant="ghost" size="sm" onClick={() => setOpen(open === l.loan_id ? null : l.loan_id)}>{open === l.loan_id ? 'Hide' : 'View'} repayment schedule</Button></div>
              {open === l.loan_id && <div className="mt-3 max-h-[420px] overflow-y-auto rounded-lg border border-line"><Schedule id={l.loan_id} /></div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
