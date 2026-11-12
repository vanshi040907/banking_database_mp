import { useState } from 'react';
import { api, useApi } from '@shared/api.js';
import { Alert, Badge, Button, Card, EmptyState, ErrorNote, Loading, Modal, PageHeader, StatusBadge, useAction, useToast } from '@shared/ui.jsx';
import { fmtDate, inr, inrShort, titleCase } from '@shared/format.js';

// "2031-11-12T00:00:00.000Z" -> "11/31"
const expiry = (iso) => `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
// whole rupees as ₹75,000, but keep paise when there are some (₹75,000.50)
const limit = (v) => (Number(v) % 1 ? inr(v) : inrShort(v));
// the API already masks the number ("**** **** **** 7869"); show it with dots
const dots = (masked) => masked.replace(/\*/g, '•');

function CardTile({ card, onBlock }) {
  const live = card.status === 'ACTIVE';
  return (
    <Card className={`relative overflow-hidden p-7 ${live ? '' : 'opacity-70'}`}>
      <div className="flex items-start justify-between">
        <span className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-violet-600">{titleCase(card.cardType)} card</span>
        <StatusBadge status={card.status} />
      </div>
      <div className="serif tnum mt-10 text-[28px] tracking-[0.06em] text-ink-900">{dots(card.cardNumber)}</div>
      <div className="mt-8 flex items-end justify-between text-[13.5px]">
        <div><div className="text-ink-400">Expires</div><div className="tnum font-medium text-ink-800">{expiry(card.expiryDate)}</div></div>
        <div><div className="text-ink-400">Daily limit</div><div className="tnum font-medium text-ink-800">{limit(card.dailyLimit)}</div></div>
        <div className="text-right"><div className="text-ink-400">Linked account</div><div className="tnum font-medium text-ink-800">••{card.accountNumber.slice(-4)}</div></div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <span className="text-[13px] text-ink-400">Issued {fmtDate(card.issueDate)}</span>
        {live
          ? <Button variant="danger" size="sm" onClick={() => onBlock(card)}>Block card</Button>
          : <span className="text-[13px] text-ink-400">{card.status === 'BLOCKED' ? 'Visit your branch to unblock' : 'This card has expired'}</span>}
      </div>
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-ink-700 via-violet-400 to-transparent opacity-60" />
    </Card>
  );
}

export default function Cards() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/customer/cards');
  const [target, setTarget] = useState(null);
  const act = useAction();

  const block = () => act.run(async () => {
    await api(`/customer/cards/${target.cardId}/block`, { method: 'PATCH' });
    toast('Card blocked');
    setTarget(null);
    reload();
  });

  const cards = data?.cards ?? [];
  const active = cards.filter((c) => c.status === 'ACTIVE').length;

  return (
    <div className="soft-in">
      <PageHeader title="Cards" subtitle={data ? `${active} active of ${data.totalCards} card${data.totalCards === 1 ? '' : 's'}` : 'Your debit and credit cards, with limits and status.'} />
      {error && <ErrorNote onRetry={reload}>{error}</ErrorNote>}
      {loading && !data && <Loading />}
      {data && !cards.length && <Card><EmptyState title="No cards yet">Visit your branch to ask for a debit or credit card. It will appear here as soon as it is issued.</EmptyState></Card>}
      <div className="grid gap-5 md:grid-cols-2">
        {cards.map((c) => <CardTile key={c.cardId} card={c} onBlock={setTarget} />)}
      </div>
      {cards.length > 0 && <Alert tone="info" className="mt-6">Lost a card? Block it here straight away. Only your branch can unblock or replace it, and limits are set by your branch too.</Alert>}

      <Modal open={!!target} onClose={() => { setTarget(null); act.setError(''); }} title="Block this card?" width={460}>
        {target && (
          <div className="space-y-4">
            <p className="text-ink-500">The {titleCase(target.cardType).toLowerCase()} card ending <span className="tnum font-semibold text-ink-900">{target.cardNumber.slice(-4)}</span> will stop working immediately. You cannot undo this yourself: your branch has to unblock it.</p>
            <Alert>{act.error}</Alert>
            <div className="flex justify-end gap-2.5">
              <Button variant="ghost" onClick={() => { setTarget(null); act.setError(''); }}>Keep it active</Button>
              <Button variant="danger" loading={act.busy} onClick={block}>Block card</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
