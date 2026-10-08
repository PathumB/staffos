import {
  type Application,
  type Feedback,
  INTERVIEW_MODE_LABELS,
  type Interview,
  RECOMMENDATION_LABELS,
} from '@staffos/shared';
import { CalendarPlus, CheckCircle2, Circle, ClipboardPen, Pencil, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useCancelInterview, useFeedback, useInterviews } from '../api';
import { InterviewStatusBadge } from './badges';
import { FeedbackDialog } from './FeedbackDialog';
import { InterviewFormDialog } from './InterviewFormDialog';

/** Interviews for one application: schedule, reschedule, cancel, and scorecards. */
export function InterviewsPanel({
  application,
  canSchedule,
}: {
  application: Application;
  canSchedule: boolean;
}) {
  const interviews = useInterviews({
    pageSize: 50,
    sort: '-scheduledAt',
    filter: { applicationId: application.id },
  });
  const [scheduling, setScheduling] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Interviews</CardTitle>
        {canSchedule && application.stage === 'INTERVIEW' && (
          <Button size="sm" onClick={() => setScheduling(true)}>
            <CalendarPlus aria-hidden />
            Schedule
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {interviews.error ? (
          <ErrorState error={interviews.error} onRetry={() => void interviews.refetch()} />
        ) : !interviews.data ? (
          <div role="status" className="h-24 animate-pulse rounded-md bg-muted">
            <span className="sr-only">Loading interviews…</span>
          </div>
        ) : interviews.data.data.length === 0 ? (
          <EmptyState
            title="No interviews yet"
            description={
              application.stage === 'INTERVIEW'
                ? 'Schedule one to send calendar invites.'
                : 'Interviews can be scheduled once the candidate is in the Interview stage.'
            }
          />
        ) : (
          <ul className="grid gap-3">
            {interviews.data.data.map((i) => (
              <InterviewItem key={i.id} interview={i} canSchedule={canSchedule} />
            ))}
          </ul>
        )}
      </CardContent>
      <InterviewFormDialog
        open={scheduling}
        onOpenChange={setScheduling}
        applicationId={application.id}
      />
    </Card>
  );
}

function InterviewItem({ interview, canSchedule }: { interview: Interview; canSchedule: boolean }) {
  const { user, can } = useAuth();
  const feedback = useFeedback(interview.id, true);
  const cancel = useCancelInterview();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [scoring, setScoring] = useState(false);

  const onPanel = interview.interviewers.some((p) => p.id === user?.id);
  const mine = feedback.data?.find((f) => f.interviewer.id === user?.id);
  const canEditMine = mine ? new Date(mine.editableUntil) > new Date() : true;
  const scheduled = interview.status === 'SCHEDULED';

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {formatDateTime(interview.scheduledAt)}{' '}
            <span className="font-normal text-muted-foreground">
              · {interview.durationMin} min · {INTERVIEW_MODE_LABELS[interview.mode]}
            </span>
          </p>
          {interview.location && <p className="text-muted-foreground">{interview.location}</p>}
          {interview.meetingUrl && (
            <a
              href={interview.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary underline-offset-4 hover:underline"
            >
              {interview.meetingUrl}
            </a>
          )}
        </div>
        <InterviewStatusBadge status={interview.status} />
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Interview panel">
        {interview.interviewers.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5">
            {p.submitted ? (
              <CheckCircle2 className="size-4 text-success" aria-hidden />
            ) : (
              <Circle className="size-4 text-muted-foreground" aria-hidden />
            )}
            {p.name}
            <span className="sr-only">
              {p.submitted ? '(feedback submitted)' : '(no feedback yet)'}
            </span>
          </li>
        ))}
      </ul>

      {feedback.data && feedback.data.length > 0 && (
        <div className="mt-3 grid gap-2">
          {feedback.data.map((f) => (
            <Scorecard key={f.id} feedback={f} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {onPanel &&
          can('interview-feedback:write') &&
          interview.status !== 'CANCELLED' &&
          canEditMine && (
            <Button
              size="sm"
              variant={mine ? 'outline' : 'default'}
              onClick={() => setScoring(true)}
            >
              <ClipboardPen aria-hidden />
              {mine ? 'Edit feedback' : 'Give feedback'}
            </Button>
          )}
        {canSchedule && scheduled && (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Reschedule
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
              <XCircle aria-hidden />
              Cancel interview
            </Button>
          </>
        )}
      </div>

      <InterviewFormDialog
        open={editing}
        onOpenChange={setEditing}
        applicationId={interview.applicationId}
        interview={interview}
      />
      {scoring && (
        <FeedbackDialog
          open={scoring}
          onOpenChange={setScoring}
          interviewId={interview.id}
          candidateName={interview.candidate.name}
          existing={mine}
        />
      )}
      <ActionDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel interview"
        description="Everyone invited gets a cancellation for their calendar."
        confirmLabel="Cancel interview"
        destructive
        note={{ label: 'Reason', required: true }}
        onConfirm={async (reason) => {
          try {
            await cancel.mutateAsync({ id: interview.id, reason: reason ?? '' });
            toast.success('Interview cancelled.');
          } catch (error) {
            toast.error(error instanceof ApiClientError ? error.message : 'Could not cancel.');
          }
        }}
      />
    </li>
  );
}

function Scorecard({ feedback }: { feedback: Feedback }) {
  const positive = feedback.recommendation === 'YES' || feedback.recommendation === 'STRONG_YES';
  return (
    <div className="rounded-md bg-muted/50 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{feedback.interviewer.name}</span>
        <Badge variant={positive ? 'success' : 'destructive'}>
          {RECOMMENDATION_LABELS[feedback.recommendation]}
        </Badge>
      </div>
      <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs">
        {feedback.scores.map((s) => (
          <div key={s.criterion} className="contents">
            <dt className="text-muted-foreground">{s.criterion}</dt>
            <dd className="tabular-nums">{s.score}/5</dd>
          </div>
        ))}
      </dl>
      {feedback.notes && <p className="mt-1.5 whitespace-pre-line text-xs">{feedback.notes}</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        Submitted {formatDateTime(feedback.submittedAt)}
      </p>
    </div>
  );
}
