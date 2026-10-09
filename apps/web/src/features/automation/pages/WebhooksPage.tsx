import { zodResolver } from '@hookform/resolvers/zod';
import {
  type DeliveryStatus,
  SUBSCRIBABLE_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_NAMES,
  type Webhook,
  webhookInputSchema,
} from '@staffos/shared';
import { Copy, KeyRound, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ActionDialog } from '@/components/action-dialog';
import { FormField } from '@/components/form-field';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import {
  useCreateWebhook,
  useDeleteWebhook,
  useDeliveries,
  useRedeliver,
  useRotateSecret,
  useUpdateWebhook,
  useWebhooks,
} from '../api';

const VARIANT: Record<DeliveryStatus, 'success' | 'destructive' | 'secondary'> = {
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  PENDING: 'secondary',
};

/** US-HOOK-01: signed outgoing webhooks with a delivery log. */
export function WebhooksPage() {
  const webhooks = useWebhooks();
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  const rotate = useRotateSecret();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [rotating, setRotating] = useState<Webhook | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Each delivery is a POST signed with X-StaffOS-Signature: sha256=HMAC(secret, body), retried up to 5 times."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Add endpoint
          </Button>
        }
      />
      {webhooks.error ? (
        <ErrorState error={webhooks.error} onRetry={() => void webhooks.refetch()} />
      ) : webhooks.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : webhooks.data.length === 0 ? (
        <EmptyState title="No endpoints yet" description="Add an https URL to receive events." />
      ) : (
        <ul className="grid gap-3">
          {webhooks.data.map((w) => (
            <li key={w.id}>
              <Card>
                <CardContent className="grid gap-3 pt-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="grid min-w-0 gap-1">
                      <span className="break-all font-mono text-sm">{w.url}</span>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={w.active ? 'success' : 'secondary'}>
                          {w.active ? 'Active' : 'Paused'}
                        </Badge>
                        {w.events.map((e) => (
                          <Badge key={e} variant="outline">
                            {WEBHOOK_EVENT_NAMES[e]}
                          </Badge>
                        ))}
                        {w.lastDelivery && (
                          <Badge variant={VARIANT[w.lastDelivery.status]}>
                            Last:{' '}
                            {w.lastDelivery.responseStatus ?? w.lastDelivery.status.toLowerCase()}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="ml-auto flex flex-wrap gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update.mutate(
                            { id: w.id, input: { active: !w.active } },
                            { onError: () => toast.error('Could not update the endpoint.') },
                          )
                        }
                      >
                        {w.active ? 'Pause' : 'Activate'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOpen(open === w.id ? null : w.id)}
                      >
                        {open === w.id ? 'Hide deliveries' : 'Deliveries'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Rotate secret for ${w.url}`}
                        onClick={() => setRotating(w)}
                      >
                        <KeyRound aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${w.url}`}
                        onClick={() => setDeleting(w)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {open === w.id && <Deliveries webhookId={w.id} />}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CreateWebhookDialog open={creating} onOpenChange={setCreating} onCreated={setSecret} />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <ActionDialog
        open={rotating !== null}
        onOpenChange={(o) => !o && setRotating(null)}
        title="Rotate the signing secret?"
        description="The old secret stops working immediately. Update your receiver with the new one."
        confirmLabel="Rotate"
        onConfirm={async () => {
          if (!rotating) return;
          setSecret((await rotate.mutateAsync(rotating.id)).secret);
        }}
      />
      <ActionDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this endpoint?"
        description="No more events are sent to it."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast.success('Endpoint deleted.');
        }}
      />
    </>
  );
}

function Deliveries({ webhookId }: { webhookId: string }) {
  const [page, setPage] = useState(1);
  const deliveries = useDeliveries(webhookId, page);
  const redeliver = useRedeliver(webhookId);
  if (deliveries.error) {
    return <ErrorState error={deliveries.error} onRetry={() => void deliveries.refetch()} />;
  }
  if (deliveries.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { data, meta } = deliveries.data;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No deliveries yet.</p>;
  const pages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  return (
    <div className="grid gap-2">
      <ul className="divide-y rounded-md border text-sm">
        {data.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <Badge variant={VARIANT[d.status]}>{d.status.toLowerCase()}</Badge>
            <span className="font-mono text-xs">{WEBHOOK_EVENT_NAMES[d.event]}</span>
            <span className="text-muted-foreground">
              {formatDateTime(d.createdAt)} · {d.attempts} attempt(s)
              {d.responseStatus !== null && ` · HTTP ${d.responseStatus}`}
              {d.status === 'PENDING' &&
                d.nextAttemptAt &&
                ` · next ${formatDateTime(d.nextAttemptAt)}`}
            </span>
            {d.responseBody && d.status !== 'SUCCEEDED' && (
              <span
                className="w-full truncate text-xs text-muted-foreground"
                title={d.responseBody}
              >
                {d.responseBody}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={redeliver.isPending}
              onClick={() =>
                redeliver.mutate(d.id, {
                  onSuccess: () => toast.success('Sent again as a new delivery.'),
                  onError: () => toast.error('Could not redeliver.'),
                })
              }
            >
              <RotateCcw aria-hidden />
              Redeliver
            </Button>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

type Values = z.input<typeof webhookInputSchema>;

function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (secret: string) => void;
}) {
  const create = useCreateWebhook();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState } = useForm<Values>({
    resolver: zodResolver(webhookInputSchema),
    defaultValues: { url: '', events: ['EMPLOYEE_HIRED'], active: true },
  });
  const e = formState.errors;

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setServerError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const created = await create.mutateAsync(values);
      close(false);
      onCreated(created.secret);
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [f, m] of Object.entries(error.fieldErrors))
          setError(f as keyof Values, { message: m[0] });
        setServerError(error.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add webhook endpoint</DialogTitle>
          <DialogDescription>
            Only https URLs on the public internet are accepted.
          </DialogDescription>
        </DialogHeader>
        <form id="webhook-form" onSubmit={onSubmit} noValidate className="grid gap-4">
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          <FormField label="URL" error={e.url?.message}>
            {(p) => (
              <Input
                {...p}
                type="url"
                placeholder="https://example.com/hooks/staffos"
                {...register('url')}
              />
            )}
          </FormField>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Events</legend>
            {SUBSCRIBABLE_WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={ev}
                  className="size-4 accent-primary"
                  {...register('events')}
                />
                <span className="font-mono">{WEBHOOK_EVENT_NAMES[ev]}</span>
              </label>
            ))}
            {e.events?.message && <p className="text-xs text-destructive">{e.events.message}</p>}
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="webhook-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The secret exists in plain text only here; it can't be shown again. */
function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signing secret</DialogTitle>
          <DialogDescription>
            Copy it now and store it in your receiver. It won’t be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 text-sm">
            {secret}
          </code>
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy secret"
            onClick={() =>
              void navigator.clipboard
                .writeText(secret ?? '')
                .then(() => toast.success('Copied.'))
                .catch(() => toast.error('Copy failed; select the text instead.'))
            }
          >
            <Copy aria-hidden />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
