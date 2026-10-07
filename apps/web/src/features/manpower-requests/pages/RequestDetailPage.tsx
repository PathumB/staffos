import {
  EMIRATE_LABELS,
  formatFils,
  JOB_CATEGORY_LABELS,
  type ManpowerRequest,
} from '@staffos/shared';
import { ArrowLeft, Check, Pencil, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { type RequestAction, useRequest, useRequestAction } from '../api';
import { RequestFormDialog } from '../components/RequestFormDialog';
import { RequestStatusBadge } from '../components/status';

const DIALOGS: Record<
  RequestAction,
  {
    title: string;
    confirm: string;
    note?: { label: string; required: boolean };
    destructive?: boolean;
    done: string;
  }
> = {
  submit: { title: 'Submit request', confirm: 'Submit', done: 'Request submitted.' },
  approve: {
    title: 'Approve request',
    confirm: 'Approve',
    note: { label: 'Comment', required: false },
    done: 'Request approved.',
  },
  reject: {
    title: 'Reject request',
    confirm: 'Reject',
    note: { label: 'Reason', required: true },
    destructive: true,
    done: 'Request rejected.',
  },
  cancel: {
    title: 'Cancel request',
    confirm: 'Cancel request',
    note: { label: 'Reason', required: true },
    destructive: true,
    done: 'Request cancelled.',
  },
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/** Which actions this user may take now. UX only — the API enforces the same rules. */
function availableActions(
  r: ManpowerRequest,
  can: (p: 'manpower-requests:write' | 'manpower-requests:approve') => boolean,
  isClientUser: boolean,
) {
  const editable = r.status === 'DRAFT' || r.status === 'SUBMITTED';
  return {
    edit: can('manpower-requests:write') && editable,
    submit: can('manpower-requests:write') && !isClientUser && editable,
    approve: can('manpower-requests:approve') && r.status === 'PENDING_APPROVAL',
    reject: can('manpower-requests:approve') && r.status === 'PENDING_APPROVAL',
    cancel:
      can('manpower-requests:write') &&
      (isClientUser
        ? editable
        : ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED'].includes(r.status)),
  };
}

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const { can, user } = useAuth();
  const request = useRequest(id);
  const action = useRequestAction();
  const [dialog, setDialog] = useState<RequestAction | null>(null);
  const [editing, setEditing] = useState(false);

  if (request.error)
    return <ErrorState error={request.error} onRetry={() => void request.refetch()} />;
  if (!request.data) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const r = request.data;
  const actions = availableActions(r, can, Boolean(user?.clientId));

  const run = async (kind: RequestAction, note?: string) => {
    try {
      const updated = await action.mutateAsync({
        id: r.id,
        action: kind,
        version: r.version,
        note,
      });
      toast.success(
        kind === 'submit' && updated.status === 'PENDING_APPROVAL'
          ? 'Submitted for HR Manager approval.'
          : DIALOGS[kind].done,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'STALE_VERSION'
          ? 'Someone else changed this request. The latest version is now shown.'
          : error instanceof ApiClientError
            ? error.message
            : 'Action failed.',
      );
    }
  };

  return (
    <>
      <Link
        to="/requests"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All requests
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {r.headcount} × {r.roleTitle}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link
              to={`/clients/${r.client.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {r.client.name}
            </Link>
            <RequestStatusBadge status={r.status} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.edit && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
          )}
          {actions.submit && (
            <Button onClick={() => setDialog('submit')}>
              <Send aria-hidden />
              Submit
            </Button>
          )}
          {actions.approve && (
            <Button onClick={() => setDialog('approve')}>
              <Check aria-hidden />
              Approve
            </Button>
          )}
          {actions.reject && (
            <Button variant="outline" onClick={() => setDialog('reject')}>
              <X aria-hidden />
              Reject
            </Button>
          )}
          {actions.cancel && (
            <Button variant="ghost" onClick={() => setDialog('cancel')}>
              Cancel request
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Category">{JOB_CATEGORY_LABELS[r.category]}</Detail>
              <Detail label="Location">
                {r.location}, {EMIRATE_LABELS[r.emirate]}
              </Detail>
              <Detail label="Project">{r.project?.name ?? '—'}</Detail>
              <Detail label="Start date">{r.startDate}</Detail>
              <Detail label="Duration">
                {r.durationMonths ? `${r.durationMonths} months` : 'Open-ended'}
              </Detail>
              <Detail label="Bill rate (per hour)">
                {r.billRateMinFils || r.billRateMaxFils
                  ? `${formatFils(r.billRateMinFils)} – ${formatFils(r.billRateMaxFils)}`
                  : '—'}
              </Detail>
            </dl>
            {r.requirements && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">Requirements</p>
                <p className="mt-1 text-sm whitespace-pre-line">{r.requirements}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              <Detail label="Created">
                {formatDateTime(r.createdAt)}
                {r.createdBy && ` by ${r.createdBy.name}`}
              </Detail>
              <Detail label="Submitted">{formatDateTime(r.submittedAt)}</Detail>
              <Detail label="Decision">
                {r.decidedAt
                  ? `${formatDateTime(r.decidedAt)}${r.decidedBy ? ` by ${r.decidedBy.name}` : ''}`
                  : '—'}
                {r.decisionComment && (
                  <span className="mt-1 block text-muted-foreground">“{r.decisionComment}”</span>
                )}
              </Detail>
              {r.cancelReason && <Detail label="Cancellation reason">{r.cancelReason}</Detail>}
            </dl>
          </CardContent>
        </Card>
      </div>

      {dialog && (
        <ActionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={DIALOGS[dialog].title}
          description={
            dialog === 'submit'
              ? `${r.headcount} people requested. More than 20 needs HR Manager approval.`
              : undefined
          }
          confirmLabel={DIALOGS[dialog].confirm}
          destructive={DIALOGS[dialog].destructive}
          note={DIALOGS[dialog].note}
          onConfirm={(note) => run(dialog, note)}
        />
      )}
      <RequestFormDialog open={editing} onOpenChange={setEditing} request={r} />
    </>
  );
}
