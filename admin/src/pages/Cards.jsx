import { useState } from 'react';
import { api } from '@shared/api.js';
import { Alert, Button, Card, Field, Input, KV, Money, PageHeader, Segmented, useAction, useToast } from '@shared/ui.jsx';
import { fmtDate, groupAcc, titleCase } from '@shared/format.js';

// the backend accepts 1 to 10 digits plus up to two decimals
const LIMIT = /^[1-9]\d{0,9}(\.\d{1,2})?$/;
const digits = (s) => s.replace(/[^\d]/g, '');
const money = (s) => s.replace(/[^\d.]/g, '');

export default function Cards() {
  const toast = useToast();
  const [log, setLog] = useState([]); // what this session has done, newest first

  const [acc, setAcc] = useState('');
  const [type, setType] = useState('DEBIT');
  const [limit, setLimit] = useState('');
  const issue = useAction();

  const [cardId, setCardId] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const change = useAction();

  const submitIssue = (e) => {
    e.preventDefault();
    issue.run(async () => {
      if (limit && !LIMIT.test(limit)) throw new Error('Enter a daily limit like 50000 or 50000.50, or leave it empty for the default.');
      const r = await api('/employee/cards', { method: 'POST', body: { accountNumber: acc, cardType: type, ...(limit ? { dailyLimit: limit } : {}) } });
      toast('Card issued');
      setLog((l) => [{ kind: 'issued', ...r.card }, ...l]);
      setCardId(String(r.card.cardId));
      setAcc(''); setLimit('');
    });
  };

  const submitLimit = (e) => {
    e.preventDefault();
    change.run(async () => {
      if (!LIMIT.test(newLimit)) throw new Error('Enter a daily limit like 50000 or 50000.50.');
      const r = await api(`/employee/cards/${cardId}/limit`, { method: 'PATCH', body: { dailyLimit: newLimit } });
      toast('Daily limit updated');
      setLog((l) => [{ kind: 'limit', cardId: r.card.cardId, dailyLimit: r.card.dailyLimit }, ...l]);
      setNewLimit('');
    });
  };

  return (
    <div className="soft-in">
      <PageHeader title="Cards" subtitle="Issue debit and credit cards, and set their daily spending limits." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="form" onSubmit={submitIssue} className="space-y-5 p-7">
          <h2 className="text-[22px]">Issue a card</h2>
          <Field label="Account number" hint="The account must be active and in your branch, unless your role covers all branches.">
            <Input value={acc} onChange={(e) => setAcc(digits(e.target.value))} inputMode="numeric" placeholder="10-digit account number" required />
          </Field>
          <Field label="Card type">
            <div className="pt-0.5"><Segmented value={type} onChange={setType} options={[['DEBIT', 'Debit'], ['CREDIT', 'Credit']]} /></div>
          </Field>
          <Field label="Daily limit (optional)" hint="Leave empty for the default of ₹50,000.">
            <Input value={limit} onChange={(e) => setLimit(money(e.target.value))} inputMode="decimal" placeholder="50000" />
          </Field>
          <Alert>{issue.error}</Alert>
          <Button type="submit" loading={issue.busy} disabled={acc.length < 6} className="w-full">Issue card</Button>
        </Card>

        <Card as="form" onSubmit={submitLimit} className="space-y-5 p-7">
          <h2 className="text-[22px]">Change a daily limit</h2>
          <Field label="Card ID" hint="Shown when a card is issued. Only active cards can be changed.">
            <Input value={cardId} onChange={(e) => setCardId(digits(e.target.value))} inputMode="numeric" placeholder="e.g. 1" required />
          </Field>
          <Field label="New daily limit">
            <Input value={newLimit} onChange={(e) => setNewLimit(money(e.target.value))} inputMode="decimal" placeholder="75000" required className="serif tnum text-[20px]" />
          </Field>
          <Alert>{change.error}</Alert>
          <Button type="submit" loading={change.busy} disabled={!cardId || !newLimit} className="w-full">Update limit</Button>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-[21px]">This session</h2>
        {log.length === 0 ? <p className="text-[14px] text-ink-400">Cards you issue and limits you change will be listed here.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {log.map((e, i) => (
              <Card key={i} className="px-5 py-2">
                <dl>
                  {e.kind === 'issued' ? (
                    <>
                      <KV k={`Card #${e.cardId} issued`} v={<span className="tnum">{e.cardNumber}</span>} />
                      <KV k={`${titleCase(e.cardType)} · account ${groupAcc(e.accountNumber)}`} v={<><Money value={e.dailyLimit} /> a day</>} />
                      <KV k="Expires" v={fmtDate(e.expiryDate)} />
                    </>
                  ) : (
                    <KV k={`Card #${e.cardId} limit changed`} v={<><Money value={e.dailyLimit} /> a day</>} />
                  )}
                </dl>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
