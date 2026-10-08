import { STAGE_LABELS } from '@staffos/shared';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { useJob, useTransition } from '@/features/recruitment/api';
import { StageBadge } from '@/features/recruitment/components/badges';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useApplication, useOffers } from '../api';
import { InterviewsPanel } from '../components/InterviewsPanel';
import { OffersPanel } from '../components/OffersPanel';

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const { can, user } = useAuth();
  const application = useApplication(id);
  const job = useJob(application.data?.job.id ?? '', Boolean(application.data) && can('jobs:read'));
  const offers = useOffers(
    { pageSize: 20, filter: { applicationId: id, status: 'ACCEPTED' } },
    can('offers:read'),
  );
  const transition = useTransition();
  const [hiring, setHiring] = useState(false);

  if (application.error) {
    return <ErrorState error={application.error} onRetry={() => void application.refetch()} />;
  }
  if (!application.data) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const a = application.data;
  // Same rule as the API: admins/HR, or a recruiter assigned to the job.
  const isAdmin = user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'HR_MANAGER') ?? false;
  const onJob = job.data?.recruiters.some((r) => r.id === user?.id) ?? false;
  const canManage = can('applications:transition') && (isAdmin || onJob);
  const canHire = canManage && a.stage === 'OFFER' && (offers.data?.data.length ?? 0) > 0;

  const hire = async () => {
    try {
      await transition.mutateAsync({ id: a.id, input: { to: 'HIRED', version: a.version } });
      toast.success(`${a.candidate.name} hired. Employee record and onboarding plan created.`);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'STALE_VERSION'
          ? 'Someone else moved this candidate. The latest version is now shown.'
          : error instanceof ApiClientError
            ? error.message
            : 'Could not hire.',
      );
    }
  };

  return (
    <>
      <Link
        to={`/jobs/${a.job.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {a.job.title} pipeline
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {a.candidate.name}
            <StageBadge stage={a.stage} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.job.title} · {a.job.client.name} ·{' '}
            <Link
              to={`/candidates/${a.candidate.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              Candidate profile
            </Link>
          </p>
        </div>
        {canHire && (
          <Button onClick={() => setHiring(true)}>
            <BadgeCheck aria-hidden />
            Hire
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 lg:col-span-2">
          {(can('interviews:write') || can('interview-feedback:write')) && (
            <InterviewsPanel application={a} canSchedule={canManage && can('interviews:write')} />
          )}
          {can('offers:read') && (
            <OffersPanel application={a} canCreate={canManage && can('offers:write')} />
          )}
        </div>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Stage history</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 text-sm">
              {[...(a.history ?? [])].reverse().map((h, index) => (
                <li key={`${h.changedAt}-${index}`} className="border-l-2 pl-3">
                  <p className="font-medium">
                    {h.fromStage ? `${STAGE_LABELS[h.fromStage]} → ` : ''}
                    {STAGE_LABELS[h.toStage]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(h.changedAt)}
                    {h.changedBy && ` · ${h.changedBy.name}`}
                  </p>
                  {h.reason && <p className="mt-0.5 text-xs">“{h.reason}”</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <ActionDialog
        open={hiring}
        onOpenChange={setHiring}
        title={`Hire ${a.candidate.name}?`}
        description="This creates their employee record and onboarding plan, and tells the account manager."
        confirmLabel="Hire"
        onConfirm={hire}
      />
    </>
  );
}
