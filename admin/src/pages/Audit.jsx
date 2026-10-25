import { useApi } from '@shared/api.js';
import { Card, ErrorNote, Loading, PageHeader, Table, EmptyState } from '@shared/ui.jsx';
import { fmtDateTime, titleCase } from '@shared/format.js';

export default function Audit() {
  const { data, error, reload } = useApi('/staff/audit');
  return (
    <div className="soft-in">
      <PageHeader title="Audit log" subtitle="Sensitive actions, who did them and why. The log can only be added to." />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      <Card>
        {!data && !error ? <Loading /> : (
          <Table rowKey="log_id" rows={data} empty={<EmptyState title="Nothing logged yet" />} columns={[
            { key: 'created_at', label: 'When', render: (r) => fmtDateTime(r.created_at) },
            { key: 'action', label: 'Action', render: (r) => <span className="font-medium">{titleCase(r.action)}</span> },
            { key: 'record_id', label: 'Record', render: (r) => <span className="tnum text-ink-500">{r.table_name} {r.record_id}</span> },
            { key: 'change', label: 'Change', render: (r) => (r.old_value || r.new_value ? <span>{r.old_value ?? '—'} → {r.new_value ?? '—'}</span> : '—') },
            { key: 'emp_name', label: 'By', render: (r) => r.emp_name ?? 'System' },
            { key: 'details', label: 'Details', className: 'max-w-[260px] text-ink-500' },
          ]} />
        )}
      </Card>
    </div>
  );
}
