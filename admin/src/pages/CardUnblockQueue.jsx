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
  Modal,
  Select,
  Textarea,
  useAction,
  useToast
} from '@shared/ui.jsx';

export default function CardUnblockQueue() {
  const [status, setStatus] = useState('PENDING');

  const state = useApi(
    `/employee/cards/unblock-requests?status=${status}`
  );

  const [target, setTarget] = useState(null);
  const [note, setNote] = useState('');

  const action = useAction();
  const toast = useToast();

  function close() {
    if (action.busy) return;

    setTarget(null);
    setNote('');
    action.setError('');
  }

  function review(event) {
    event.preventDefault();

    if (!target || action.busy) return;

    action.run(async () => {
      const result = await api(
        `/employee/cards/unblock-requests/${target.requestId}`,
        {
          method: 'PATCH',
          body: {
            decision: target.decision,
            note
          }
        }
      );

      toast(result.message);
      setTarget(null);
      setNote('');
      state.reload();
    });
  }

  return (
    <Card className="mt-8 space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[21px]">
          Card unblock requests
        </h2>

        <Button
          variant="secondary"
          size="sm"
          onClick={state.reload}
        >
          Refresh
        </Button>
      </div>

      <p className="text-sm text-ink-400">
        Latest 100 requests in your permitted branch scope.
      </p>

      <Field label="Request status">
        <Select
          value={status}
          onChange={event => setStatus(event.target.value)}
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      </Field>

      {state.loading && <Loading />}

      {state.error && (
        <ErrorNote onRetry={state.reload}>
          {state.error}
        </ErrorNote>
      )}

      {!state.loading && state.data?.requests.length === 0 && (
        <p className="text-sm text-ink-400">
          No requests in this category.
        </p>
      )}

      {!state.loading && state.data?.requests.map(request => (
        <div
          key={request.requestId}
          className="space-y-2 rounded-lg border border-line p-4"
        >
          <div className="flex justify-between gap-3">
            <span className="font-medium">
              Card {request.cardNumber}
            </span>

            <Badge>{request.status}</Badge>
          </div>

          <p className="text-sm text-ink-400">
            Account {request.accountNumber} · {request.branchName}
          </p>

          <p className="text-sm">
            Customer reason: {request.reason}
          </p>

          {request.reviewNote && (
            <p className="text-sm">
              Review: {request.reviewNote}
            </p>
          )}

          {request.status === 'PENDING' && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => {
                  action.setError('');
                  setNote('');
                  setTarget({
                    ...request,
                    decision: 'APPROVED'
                  });
                }}
              >
                Approve
              </Button>

              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  action.setError('');
                  setNote('');
                  setTarget({
                    ...request,
                    decision: 'REJECTED'
                  });
                }}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}

      <Modal
        open={!!target}
        onClose={close}
        title={
          target?.decision === 'APPROVED'
            ? 'Approve unblock?'
            : 'Reject request?'
        }
      >
        <form onSubmit={review} className="space-y-4">
          <p className="text-sm text-ink-500">
            {target?.decision === 'APPROVED'
              ? 'Approval reactivates this card.'
              : 'The card will remain blocked.'}
          </p>

          <Field label="Review note">
            <Textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              minLength={5}
              maxLength={255}
              required
              disabled={action.busy}
            />
          </Field>

          <Alert>{action.error}</Alert>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={action.busy}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              loading={action.busy}
              disabled={note.trim().length < 5}
            >
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}