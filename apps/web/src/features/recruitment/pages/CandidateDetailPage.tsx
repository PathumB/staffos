import { ArrowLeft, Briefcase, Mail, Pencil, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { DocumentsPanel } from '@/features/documents/components/DocumentsPanel';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useAddApplication, useApplications, useCandidate, useJobs } from '../api';
import { StageBadge } from '../components/badges';
import { CandidateFormDialog } from '../components/CandidateFormDialog';

function AddToJobDialog({
  candidateId,
  open,
  onOpenChange,
  existingJobIds,
}: {
  candidateId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingJobIds: string[];
}) {
  const { user } = useAuth();
  const isRecruiter =
    user?.roles.includes('RECRUITER') &&
    !user.roles.some((r) => r === 'SUPER_ADMIN' || r === 'HR_MANAGER');
  const jobs = useJobs(
    {
      pageSize: 50,
      sort: 'title',
      filter: { status: 'OPEN', recruiterId: isRecruiter ? user?.id : undefined },
    },
    open,
  );
  const add = useAddApplication();
  const options = jobs.data?.data.filter((j) => !existingJobIds.includes(j.id)) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to a job</DialogTitle>
          <DialogDescription>Open jobs you work on.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 divide-y overflow-y-auto text-sm">
          {options.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{j.title}</p>
                <p className="truncate text-xs text-muted-foreground">{j.client.name}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={add.isPending}
                onClick={async () => {
                  try {
                    await add.mutateAsync({ candidateId, jobId: j.id });
                    toast.success(`Added to ${j.title}.`);
                    onOpenChange(false);
                  } catch (error) {
                    toast.error(
                      error instanceof ApiClientError ? error.message : 'Could not add to the job.',
                    );
                  }
                }}
              >
                Add
              </Button>
            </li>
          ))}
          {jobs.data && options.length === 0 && (
            <li className="py-6 text-center text-muted-foreground">No other open jobs.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function CandidateDetailPage() {
  const { id = '' } = useParams();
  const { can, user } = useAuth();
  const candidate = useCandidate(id);
  const applications = useApplications(
    { pageSize: 50, filter: { candidateId: id } },
    can('applications:read'),
  );
  const [editing, setEditing] = useState(false);
  const [addingToJob, setAddingToJob] = useState(false);

  if (candidate.error)
    return <ErrorState error={candidate.error} onRetry={() => void candidate.refetch()} />;
  if (!candidate.data) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const c = candidate.data;
  const isClient = Boolean(user?.clientId);

  return (
    <>
      {!isClient && (
        <Link
          to="/candidates"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All candidates
        </Link>
      )}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {c.firstName} {c.lastName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              c.currentTitle,
              c.location,
              c.totalExperienceMonths !== null &&
                `${Math.round(c.totalExperienceMonths / 12)} yrs experience`,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
        <div className="flex gap-2">
          {can('applications:transition') && (
            <Button onClick={() => setAddingToJob(true)}>
              <Briefcase aria-hidden />
              Add to job
            </Button>
          )}
          {can('candidates:write') && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid content-start gap-4 lg:col-span-2">
          {can('documents:read') && (
            <DocumentsPanel ownerType="CANDIDATE" ownerId={c.id} canUpload />
          )}
          <Card>
            <CardHeader>
              <CardTitle>Applications</CardTitle>
            </CardHeader>
            <CardContent>
              {!can('applications:read') ? (
                <p className="text-sm text-muted-foreground">You can't see applications.</p>
              ) : applications.error ? (
                <ErrorState
                  error={applications.error}
                  onRetry={() => void applications.refetch()}
                />
              ) : !applications.data ? (
                <div className="h-16 animate-pulse rounded bg-muted" />
              ) : applications.data.data.length === 0 ? (
                <EmptyState title="Not in any pipeline yet" />
              ) : (
                <ul className="divide-y text-sm">
                  {applications.data.data.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div>
                        <Link
                          to={`/jobs/${a.job.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {a.job.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {a.job.client.name} · since {formatDateTime(a.stageChangedAt)}
                          {a.rejectReason && ` · “${a.rejectReason}”`}
                        </p>
                      </div>
                      <Link
                        to={`/applications/${a.id}`}
                        aria-label={`Open application for ${a.job.title}`}
                        className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <StageBadge stage={a.stage} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {c.summary ? (
                <p className="whitespace-pre-line">{c.summary}</p>
              ) : (
                <p className="text-muted-foreground">No summary.</p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden />
                {isClient ? (
                  c.email
                ) : (
                  <a href={`mailto:${c.email}`} className="hover:underline">
                    {c.email}
                  </a>
                )}
              </p>
              {c.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" aria-hidden />
                  <a href={`tel:${c.phone}`} className="hover:underline">
                    {c.phone}
                  </a>
                </p>
              )}
              {isClient && (
                <p className="text-xs text-muted-foreground">
                  Contact details are shared by your account manager.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {c.skills.length === 0 && (
                <span className="text-sm text-muted-foreground">None listed</span>
              )}
              {c.skills.map((s) => (
                <Badge key={s.name} variant="secondary">
                  {s.name}
                  {s.years ? ` · ${s.years} yrs` : ''}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <CandidateFormDialog open={editing} onOpenChange={setEditing} candidate={c} />
      <AddToJobDialog
        candidateId={c.id}
        open={addingToJob}
        onOpenChange={setAddingToJob}
        existingJobIds={applications.data?.data.map((a) => a.job.id) ?? []}
      />
    </>
  );
}
