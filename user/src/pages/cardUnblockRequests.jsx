import { useState } from 'react';
import { api, useApi } from '@shared/api.js';

import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  Select,
  Textarea,
  useAction,
  useToast
} from '@shared/ui.jsx';

export default function CardUnblockRequests({ cards, onRefresh }) {
  const state = useApi('/customer/card-unblock-requests');

  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');

  const action = useAction();
  const toast = useToast();

  const blocked = cards.filter(card => card.status === 'BLOCKED');
  const requests = state.data?.requests ?? [];

  const pending = requests.some(request =>
    String(request.cardId) === selected &&
    request.status === 'PENDING'
  );

  function refresh() {
    state.reload();
    onRefresh();
  }

  function submit(event) {
    event.preventDefault();

    if (!selected || pending || action.busy) return;

    action.run(async () => {
      const result = await api(
        `/customer/cards/${selected}/unblock-requests`,
        {
          method: 'POST',
          body: { reason }
        }
      );

      toast(result.message);
      setReason('');
      refresh();
    });
  }

  return (
    <Card className="mt-6 space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[21px]">Unblock requests</h2>

        <Button
          variant="secondary"
          size="sm"
          onClick={refresh}
        >
          Refresh
        </Button>
      </div>

      <p className="text-sm text-ink-400">
        Your branch reviews requests. Approval reactivates the
        card; rejection leaves it blocked.
      </p>

      {state.loading && !state.data && <Loading />}

      {state.error && (
        <ErrorNote onRetry={state.reload}>
          {state.error}
        </ErrorNote>
      )}

      {requests.map(request => {
        const card = cards.find(
          item => item.cardId === request.cardId
        );

        return (
          <div
            key={request.requestId}
            className="rounded-lg border border-line p-3"
          >
            <div className="flex justify-between gap-3">
              <span>
                Card ending{' '}
                {card?.cardNumber.slice(-4) ?? `#${request.cardId}`}
              </span>

              <Badge
                tone={
                  request.status === 'APPROVED'
                    ? 'ok'
                    : request.status === 'REJECTED'
                      ? 'danger'
                      : 'warn'
                }
              >
                {request.status}
              </Badge>
            </div>

            <p className="mt-2 text-sm text-ink-500">
              Your reason: {request.reason}
            </p>

            {request.reviewNote && (
              <p className="mt-1 text-sm text-ink-500">
                Branch response: {request.reviewNote}
              </p>
            )}
          </div>
        );
      })}

      {!state.loading && state.data && !requests.length && (
        <p className="text-sm text-ink-400">
          No requests yet.
        </p>
      )}

      {blocked.length > 0 && (
        <form
          onSubmit={submit}
          className="space-y-4 border-t border-line pt-4"
        >
          <Field label="Blocked card">
            <Select
              value={selected}
              onChange={event => {
                setSelected(event.target.value);
                setReason('');
                action.setError('');
              }}
              required
              disabled={action.busy}
            >
              <option value="">Select a blocked card</option>

              {blocked.map(card => (
                <option key={card.cardId} value={card.cardId}>
                  Card ending {card.cardNumber.slice(-4)}
                </option>
              ))}
            </Select>
          </Field>

          {pending ? (
            <Alert tone="info">
              This card already has a pending request.
            </Alert>
          ) : (
            <Field label="Why should this card be unblocked?">
              <Textarea
                value={reason}
                onChange={event => setReason(event.target.value)}
                minLength={5}
                maxLength={255}
                required
                disabled={action.busy}
              />
            </Field>
          )}

          <Alert>{action.error}</Alert>

          <Button
            type="submit"
            loading={action.busy}
            disabled={
              !selected ||
              pending ||
              state.loading ||
              !!state.error ||
              reason.trim().length < 5
            }
          >
            Request unblock
          </Button>
        </form>
      )}
    </Card>
  );
}