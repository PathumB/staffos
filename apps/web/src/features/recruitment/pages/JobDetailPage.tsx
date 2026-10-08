import { EMIRATE_LABELS, formatFils, JOB_CATEGORY_LABELS } from '@staffos/shared';
import { ArrowLeft, Pause, Pencil, Rocket, UserPlus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MatchPanel } from '@/features/ai/components/MatchPanel';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { useJob, useJobAction, usePipeline } from '../api';
import { AddCandidateDialog } from '../components/AddCandidateDialog';
import { JobStatusBadge } from '../components/badges';
import { JobFormDialog } from '../components/JobFormDialog';
import { PipelineBoard } from '../components/PipelineBoard';

export function JobDetailPage() {
  const { id = '' } = useParams();
  const { can, user } = useAuth();
  const job = useJob(id);
  const pipeline = usePipeline(id, can('applications:read'));
  const action = useJobAction();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (job.error) return <ErrorState error={job.error} onRetry={() => void job.refetch()} />;
  if (!job.data) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const j = job.data;
  const canManage = can('jobs:write');
  const canPublish = can('jobs:publish');
  // Same rule as the API: admins/HR, or a recruiter assigned to this job.
  const canMove =
    can('applications:transition') &&
    (user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'HR_MANAGER') ||
      j.recruiters.some((r) => r.id === user?.id));

  const run = async (kind: 'publish' | 'hold' | 'close') => {
    try {
      await action.mutateAsync({ id: j.id, action: kind, version: j.version });
      toast.success(
        kind === 'publish'
          ? 'Job published.'
          : kind === 'hold'
            ? 'Job put on hold.'
            : 'Job closed.',
      );
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Action failed.');
    }
  };

  return (
    <>
      <Link
        to="/jobs"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All jobs
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {j.title}
            <JobStatusBadge status={j.status} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {j.client.name} · {j.location}, {EMIRATE_LABELS[j.emirate]} · {j.headcount} needed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canMove && j.status === 'OPEN' && (
            <Button onClick={() => setAdding(true)}>
              <UserPlus aria-hidden />
              Add candidate
            </Button>
          )}
          {canPublish && (j.status === 'DRAFT' || j.status === 'ON_HOLD') && (
            <Button onClick={() => void run('publish')} disabled={action.isPending}>
              <Rocket aria-hidden />
              Publish
            </Button>
          )}
          {canManage && j.status !== 'CLOSED' && j.status !== 'FILLED' && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
          )}
          {canPublish && j.status === 'OPEN' && (
            <Button variant="outline" onClick={() => void run('hold')} disabled={action.isPending}>
              <Pause aria-hidden />
              Hold
            </Button>
          )}
          {canPublish && ['DRAFT', 'OPEN', 'ON_HOLD'].includes(j.status) && (
            <Button variant="ghost" onClick={() => void run('close')} disabled={action.isPending}>
              <XCircle aria-hidden />
              Close
            </Button>
          )}
        </div>
      </div>

      {can('applications:read') && (
        <section aria-labelledby="pipeline-heading" className="mb-6">
          <h2 id="pipeline-heading" className="mb-3 text-base font-semibold">
            Pipeline
          </h2>
          {pipeline.error ? (
            <ErrorState error={pipeline.error} onRetry={() => void pipeline.refetch()} />
          ) : pipeline.data ? (
            <PipelineBoard pipeline={pipeline.data} canMove={canMove} />
          ) : (
            <div role="status" className="h-40 animate-pulse rounded-lg bg-muted">
              <span className="sr-only">Loading pipeline…</span>
            </div>
          )}
        </section>
      )}

      {can('ai:use') && can('applications:read') && (
        <div className="mb-6">
          <MatchPanel jobId={j.id} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>About the role</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {j.description ? (
              <p className="whitespace-pre-line">{j.description}</p>
            ) : (
              <p className="text-muted-foreground">No description yet.</p>
            )}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {j.skills.length === 0 && (
                  <span className="text-muted-foreground">None listed</span>
                )}
                {j.skills.map((s) => (
                  <Badge key={s.name} variant={s.weight === 'MUST' ? 'default' : 'secondary'}>
                    {s.name}
                    {s.minYears ? ` · ${s.minYears}+ yrs` : ''}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Category</dt>
                <dd>{JOB_CATEGORY_LABELS[j.category]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Salary (per month)</dt>
                <dd>
                  {j.salaryMinFils || j.salaryMaxFils
                    ? `${formatFils(j.salaryMinFils)} – ${formatFils(j.salaryMaxFils)}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hiring manager</dt>
                <dd>{j.hiringManager.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Recruiters</dt>
                <dd>{j.recruiters.map((r) => r.name).join(', ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Source request</dt>
                <dd>
                  <Link
                    to={`/requests/${j.manpowerRequestId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    View request
                  </Link>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <JobFormDialog open={editing} onOpenChange={setEditing} job={j} />
      <AddCandidateDialog jobId={j.id} open={adding} onOpenChange={setAdding} />
    </>
  );
}
