import {
  ACTIVE_OFFER_STATUSES,
  type Application,
  CONTRACT_TYPE_LABELS,
  formatFils,
  nextOfferStatus,
  type Offer,
  type OfferAction,
  type Permission,
} from '@staffos/shared';
import { FilePlus2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useOfferAction, useOffers } from '../api';
import { OfferStatusBadge } from './badges';
import { OfferFormDialog } from './OfferFormDialog';

const ACTIONS: {
  action: OfferAction;
  label: string;
  permission: Permission;
  variant: 'default' | 'outline' | 'ghost' | 'destructive';
  note?: { label: string; required: boolean };
  done: string;
}[] = [
  {
    action: 'approve',
    label: 'Approve',
    permission: 'offers:approve',
    variant: 'default',
    done: 'Offer approved.',
  },
  {
    action: 'reject',
    label: 'Reject',
    permission: 'offers:approve',
    variant: 'outline',
    note: { label: 'Reason', required: true },
    done: 'Offer rejected.',
  },
  {
    action: 'send',
    label: 'Mark as sent',
    permission: 'offers:write',
    variant: 'default',
    done: 'Offer marked as sent.',
  },
  {
    action: 'accept',
    label: 'Candidate accepted',
    permission: 'offers:write',
    variant: 'default',
    done: 'Acceptance recorded.',
  },
  {
    action: 'decline',
    label: 'Candidate declined',
    permission: 'offers:write',
    variant: 'outline',
    note: { label: 'Reason', required: false },
    done: 'Decline recorded.',
  },
  {
    action: 'withdraw',
    label: 'Withdraw',
    permission: 'offers:write',
    variant: 'ghost',
    note: { label: 'Reason', required: true },
    done: 'Offer withdrawn.',
  },
];

/** Offers for one application, with the actions the shared lifecycle allows next. */
export function OffersPanel({
  application,
  canCreate,
}: {
  application: Application;
  canCreate: boolean;
}) {
  const offers = useOffers({ pageSize: 20, filter: { applicationId: application.id } });
  const [creating, setCreating] = useState(false);
  const hasActive = offers.data?.data.some((o) => ACTIVE_OFFER_STATUSES.includes(o.status));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Offers</CardTitle>
        {canCreate && application.stage === 'OFFER' && offers.data && !hasActive && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <FilePlus2 aria-hidden />
            Create offer
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {offers.error ? (
          <ErrorState error={offers.error} onRetry={() => void offers.refetch()} />
        ) : !offers.data ? (
          <div role="status" className="h-20 animate-pulse rounded-md bg-muted">
            <span className="sr-only">Loading offers…</span>
          </div>
        ) : offers.data.data.length === 0 ? (
          <EmptyState
            title="No offers yet"
            description={
              application.stage === 'OFFER'
                ? 'Create the offer; the hiring manager approves it before it is sent.'
                : 'Offers can be created once the candidate is in the Offer stage.'
            }
          />
        ) : (
          <ul className="grid gap-3">
            {offers.data.data.map((o) => (
              <OfferItem key={o.id} offer={o} />
            ))}
          </ul>
        )}
      </CardContent>
      <OfferFormDialog
        open={creating}
        onOpenChange={setCreating}
        applicationId={application.id}
        candidateName={application.candidate.name}
      />
    </Card>
  );
}

function OfferItem({ offer }: { offer: Offer }) {
  const { can } = useAuth();
  const act = useOfferAction();
  const [pending, setPending] = useState<(typeof ACTIONS)[number] | null>(null);
  // The API decides who may approve (the job's hiring manager or HR); this only hides
  // actions the user's role can never perform.
  const available = ACTIONS.filter(
    (a) => can(a.permission) && nextOfferStatus(offer.status, a.action),
  );

  const run = async (a: (typeof ACTIONS)[number], reason?: string) => {
    try {
      await act.mutateAsync({ id: offer.id, action: a.action, version: offer.version, reason });
      toast.success(a.done);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'STALE_VERSION'
          ? 'Someone else changed this offer. The latest version is now shown.'
          : error instanceof ApiClientError
            ? error.message
            : 'Action failed.',
      );
    }
  };

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium tabular-nums">
            {formatFils(offer.salaryFils, offer.currency)}
            <span className="font-normal text-muted-foreground"> / month</span>
          </p>
          <p className="text-muted-foreground">
            {CONTRACT_TYPE_LABELS[offer.contractType]}
            {offer.contractMonths ? ` · ${offer.contractMonths} months` : ''} · starts{' '}
            {offer.startDate}
          </p>
        </div>
        <OfferStatusBadge status={offer.status} />
      </div>
      {offer.notes && <p className="mt-2 whitespace-pre-line">{offer.notes}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Created {formatDateTime(offer.createdAt)}
        {offer.approvedBy && ` · approved by ${offer.approvedBy.name}`}
        {offer.sentAt && ` · sent ${formatDateTime(offer.sentAt)}`}
        {offer.respondedAt && ` · answered ${formatDateTime(offer.respondedAt)}`}
      </p>
      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {available.map((a) => (
            <Button
              key={a.action}
              size="sm"
              variant={a.variant}
              disabled={act.isPending}
              onClick={() => (a.note ? setPending(a) : void run(a))}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      <ActionDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `${pending.label} offer` : ''}
        confirmLabel={pending?.label ?? 'Confirm'}
        destructive={pending?.action === 'withdraw' || pending?.action === 'reject'}
        note={pending?.note}
        onConfirm={async (reason) => {
          if (pending) await run(pending, reason);
        }}
      />
    </li>
  );
}
