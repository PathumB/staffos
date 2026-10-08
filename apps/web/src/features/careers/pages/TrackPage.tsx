import { PUBLIC_STATUS_LABELS, PUBLIC_STATUSES } from '@staffos/shared';
import { CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useDataRequest, useTracking } from '../api';

const STEPS = PUBLIC_STATUSES.filter((s) => s !== 'CLOSED');

/** US-CAREERS-03: the candidate's private status page (the link is their only key). */
export function TrackPage() {
  const { token = '' } = useParams();
  const tracking = useTracking(token);
  const request = useDataRequest(token);
  const [asking, setAsking] = useState<'EXPORT' | 'DELETE' | null>(null);

  if (tracking.error) {
    return tracking.error instanceof ApiClientError && tracking.error.status === 404 ? (
      <p className="text-muted-foreground">
        We couldn&apos;t find this application. Check that you used the full link from your email.
      </p>
    ) : (
      <ErrorState error={tracking.error} onRetry={() => void tracking.refetch()} />
    );
  }
  if (!tracking.data) {
    return (
      <div role="status" className="h-48 animate-pulse rounded-lg bg-muted">
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const t = tracking.data;
  const closed = t.publicStatus === 'CLOSED';
  const current = STEPS.indexOf(t.publicStatus as (typeof STEPS)[number]);

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.jobTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Applied on {new Date(t.appliedAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai' })}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            Status: <span className="text-primary">{PUBLIC_STATUS_LABELS[t.publicStatus]}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {closed ? (
            <p className="text-sm">
              This application is closed. Thank you for your interest; we keep your details for
              other suitable roles unless you ask us to delete them.
            </p>
          ) : (
            <ol className="grid gap-3" aria-label="Application progress">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2.5 text-sm">
                  {i <= current ? (
                    <CheckCircle2 className="size-5 text-success" aria-hidden />
                  ) : (
                    <Circle className="size-5 text-muted-foreground" aria-hidden />
                  )}
                  <span className={cn(i === current && 'font-semibold')}>
                    {PUBLIC_STATUS_LABELS[s]}
                    {i === current && <span className="sr-only"> (current)</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>You can ask for a copy of your personal data, or for it to be deleted.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAsking('EXPORT')}>
              Request a copy
            </Button>
            <Button variant="outline" onClick={() => setAsking('DELETE')}>
              Delete my data
            </Button>
          </div>
        </CardContent>
      </Card>
      <ActionDialog
        open={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking === 'DELETE' ? 'Delete your data?' : 'Request a copy of your data?'}
        description={
          asking === 'DELETE'
            ? 'Our HR team will delete your personal data and CV within 30 days and confirm by email. Your application will be withdrawn.'
            : 'Our HR team will email you a copy of your personal data within 30 days.'
        }
        confirmLabel="Send request"
        destructive={asking === 'DELETE'}
        onConfirm={async () => {
          if (!asking) return;
          try {
            await request.mutateAsync({ type: asking });
            toast.success('Request sent. We will reply by email.');
          } catch (error) {
            toast.error(
              error instanceof ApiClientError ? error.message : 'Could not send the request.',
            );
          }
        }}
      />
    </div>
  );
}
