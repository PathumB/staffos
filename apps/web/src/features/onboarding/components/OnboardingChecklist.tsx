import {
  ONBOARDING_TASK_TYPE_LABELS,
  type OnboardingPlan,
  type OnboardingTask,
  PLAN_STATUS_LABELS,
  ROLE_LABELS,
} from '@staffos/shared';
import { CheckCircle2, Circle, Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCompleteTask, useReopenTask } from '../api';
import { TaskEditDialog } from './TaskEditDialog';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date());

const errorText = (error: unknown) =>
  error instanceof ApiClientError ? error.message : 'Something went wrong. Please try again.';

/** US-ONB-02 checklist. What each person can tick off comes from the API (`canComplete`). */
export function OnboardingChecklist({ plan }: { plan: OnboardingPlan }) {
  const { user } = useAuth();
  const isHr = user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'HR_MANAGER') ?? false;
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const [completing, setCompleting] = useState<OnboardingTask | null>(null);
  const [editing, setEditing] = useState<OnboardingTask | null>(null);
  const tasks = plan.tasks ?? [];
  const { done, total } = plan.progress;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="grid gap-4">
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            <span className="font-medium tabular-nums">
              {done} of {total}
            </span>{' '}
            tasks done
            {plan.progress.overdue > 0 && (
              <span className="text-destructive"> · {plan.progress.overdue} overdue</span>
            )}
          </span>
          <Badge variant={plan.status === 'COMPLETED' ? 'success' : 'secondary'}>
            {PLAN_STATUS_LABELS[plan.status]}
          </Badge>
        </div>
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">This plan has no tasks.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {tasks.map((t) => {
            const isDone = t.status !== 'PENDING';
            const overdue = !isDone && t.dueDate < today();
            return (
              <li key={t.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 gap-2.5">
                  {isDone ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p
                      className={cn('font-medium', isDone && 'text-muted-foreground line-through')}
                    >
                      {t.title}
                      {!t.required && (
                        <span className="ml-1.5 font-normal text-muted-foreground no-underline">
                          (optional)
                        </span>
                      )}
                      <span className="sr-only">{isDone ? ', done' : ', to do'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ONBOARDING_TASK_TYPE_LABELS[t.type]} ·{' '}
                      {t.assignee ? t.assignee.name : ROLE_LABELS[t.assigneeRole]} ·{' '}
                      <span className={cn(overdue && 'font-medium text-destructive')}>
                        due {t.dueDate}
                        {overdue && ' (overdue)'}
                      </span>
                    </p>
                    {isDone && (
                      <p className="text-xs text-muted-foreground">
                        Done {formatDateTime(t.completedAt)}
                        {t.completedBy && ` by ${t.completedBy.name}`}
                        {t.note && ` · “${t.note}”`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5 pl-6 sm:pl-0">
                  {t.canComplete && (
                    <Button size="sm" onClick={() => setCompleting(t)}>
                      Mark done
                    </Button>
                  )}
                  {isHr && plan.status === 'IN_PROGRESS' && !isDone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Reassign or reschedule ${t.title}`}
                      onClick={() => setEditing(t)}
                    >
                      <Pencil aria-hidden />
                      Edit
                    </Button>
                  )}
                  {isHr && isDone && plan.status !== 'CANCELLED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={reopen.isPending}
                      onClick={async () => {
                        try {
                          await reopen.mutateAsync(t.id);
                          toast.success('Task reopened.');
                        } catch (error) {
                          toast.error(errorText(error));
                        }
                      }}
                    >
                      <RotateCcw aria-hidden />
                      Reopen
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ActionDialog
        open={completing !== null}
        onOpenChange={(open) => !open && setCompleting(null)}
        title={completing ? `Mark “${completing.title}” as done` : ''}
        confirmLabel="Mark done"
        note={{ label: 'Note', required: false }}
        onConfirm={async (note) => {
          if (!completing) return;
          try {
            const updated = await complete.mutateAsync({ id: completing.id, input: { note } });
            toast.success(
              updated.status === 'COMPLETED'
                ? 'Onboarding complete. HR has been notified.'
                : 'Task done.',
            );
          } catch (error) {
            toast.error(errorText(error));
          }
        }}
      />
      {editing && (
        <TaskEditDialog task={editing} open onOpenChange={(open) => !open && setEditing(null)} />
      )}
    </div>
  );
}
