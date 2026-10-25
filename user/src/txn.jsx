import { Money } from '@shared/ui.jsx';
import { fmtDateTime, titleCase } from '@shared/format.js';

export const txnTitle = (t) => {
  if (t.counterparty_name) return t.direction === 'DEBIT' ? `To ${t.counterparty_name}` : `From ${t.counterparty_name}`;
  return t.trans_type === 'DEPOSIT' ? 'Cash deposit' : t.trans_type === 'WITHDRAWAL' ? 'Cash withdrawal' : titleCase(t.trans_type);
};

export function TxnList({ items }) {
  return (
    <ul className="divide-y divide-line/70">
      {items.map((t) => {
        const credit = t.direction === 'CREDIT';
        return (
          <li key={`${t.trans_id}-${t.direction}`} className="flex items-center gap-4 px-5 py-3.5">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${credit ? 'border-[#cfe6df] bg-ok-50 text-ok-600' : 'border-violet-200 bg-violet-50 text-violet-600'}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d={credit ? 'M7 11V3m0 0L3.5 6.5M7 3l3.5 3.5' : 'M7 3v8m0 0L3.5 7.5M7 11l3.5-3.5'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium text-ink-900">{txnTitle(t)}</div>
              <div className="truncate text-[13px] text-ink-400">{fmtDateTime(t.trans_date)} · {t.trans_mode}{t.remarks ? ` · ${t.remarks}` : ''}</div>
            </div>
            <Money value={t.amount} className={`text-[15.5px] font-medium ${credit ? 'text-ok-600' : 'text-ink-900'}`} />
          </li>
        );
      })}
    </ul>
  );
}
