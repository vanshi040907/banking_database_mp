import { useApi } from '@shared/api.js';
import { useAuth } from '@shared/auth.jsx';
import { Card, ErrorNote, Loading, Money, SectionTitle, Stat, Table } from '@shared/ui.jsx';
import { fmtDateTime, greeting, inr, num, titleCase } from '@shared/format.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { data: d, error, reload } = useApi('/staff/dashboard');
  const deposits = d?.branches?.reduce((s, b) => s + Number(b.branch_deposits), 0) ?? 0;
  const accts = Object.fromEntries((d?.accounts ?? []).map((a) => [a.status, Number(a.n)]));

  return (
    <div className="soft-in">
      <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">{user.branch_name} · {titleCase(user.role_name)}</p>
      <h1 className="mb-8 text-[38px] leading-tight">{greeting()}, {user.emp_name.split(' ')[0]}.</h1>
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {!d && !error && <Loading />}
      {d && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat label={user.all_branches ? 'Deposits, all branches' : 'Branch deposits'} value={<Money value={deposits} />} hint={`${d.branches.reduce((s, b) => s + Number(b.total_accounts), 0)} open accounts`} />
            {d.accounts && <Stat label="Active accounts" value={num(accts.ACTIVE ?? 0)} hint={`${accts.FROZEN ?? 0} frozen · ${accts.CLOSED ?? 0} closed`} />}
            {d.today && <Stat label="Transactions today" value={num(d.today.n)} hint={`${inr(d.today.volume)} moved`} />}
            {d.my_cash && <Stat label="Your cash today" value={num(d.my_cash.n)} hint={`In ${inr(d.my_cash.deposited)} · out ${inr(d.my_cash.withdrawn)}`} />}
            {d.staff && <Stat label="Active staff" value={num(d.staff.n)} />}
            {d.pending_kyc && <Stat label="KYC pending" value={num(d.pending_kyc.n)} hint="Customers awaiting verification" />}
          </div>

          {d.branches.length > 1 && (
            <section>
              <SectionTitle>Deposits by branch</SectionTitle>
              <Card>
                <Table rowKey="ifsc_code" rows={d.branches} columns={[
                  { key: 'branch_name', label: 'Branch', className: 'font-medium' },
                  { key: 'ifsc_code', label: 'IFSC', render: (r) => <span className="tnum text-ink-400">{r.ifsc_code}</span> },
                  { key: 'total_accounts', label: 'Accounts', align: 'right' },
                  { key: 'branch_deposits', label: 'Deposits', align: 'right', render: (r) => <Money value={r.branch_deposits} className="font-medium" /> },
                ]} />
              </Card>
            </section>
          )}

          {d.recent && (
            <section>
              <SectionTitle>Latest transactions</SectionTitle>
              <Card>
                <Table rowKey="trans_id" rows={d.recent} columns={[
                  { key: 'trans_date', label: 'When', render: (r) => fmtDateTime(r.trans_date) },
                  { key: 'trans_type', label: 'Type', render: (r) => titleCase(r.trans_type) },
                  { key: 'from_acc_no', label: 'From', render: (r) => <span className="tnum">{r.from_acc_no ?? '—'}</span> },
                  { key: 'to_acc_no', label: 'To', render: (r) => <span className="tnum">{r.to_acc_no ?? '—'}</span> },
                  { key: 'amount', label: 'Amount', align: 'right', render: (r) => <Money value={r.amount} className="font-medium" /> },
                ]} />
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
