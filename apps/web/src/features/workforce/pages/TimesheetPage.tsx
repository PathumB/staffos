import { formatMinutes, MAX_DAILY_MINUTES, type Timesheet, weekDates } from '@staffos/shared';
import { ArrowLeft, Check, Loader2, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useSaveTimesheet, useTimesheet, useTimesheetAction } from '../api';
import { TimesheetStatusBadge } from '../components/TimesheetStatusBadge';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const errorText = (error: unknown) =>
  error instanceof ApiClientError && error.code === 'STALE_VERSION'
    ? 'Someone else changed this timesheet. The latest version is now shown.'
    : error instanceof ApiClientError
      ? error.message
      : 'Something went wrong.';

export function TimesheetPage() {
  const { id = '' } = useParams();
  const sheet = useTimesheet(id);
  if (sheet.error) return <ErrorState error={sheet.error} onRetry={() => void sheet.refetch()} />;
  if (!sheet.data) {
    return (
      <div role="status" className="h-64 animate-pulse rounded-lg bg-muted">
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  // Keyed by version, so the editor resets to the server's copy after every save.
  return <TimesheetView key={`${sheet.data.id}-${sheet.data.version}`} sheet={sheet.data} />;
}

function TimesheetView({ sheet }: { sheet: Timesheet }) {
  const { can, user } = useAuth();
  const save = useSaveTimesheet();
  const act = useTimesheetAction();
  const [rejecting, setRejecting] = useState(false);
  const editable =
    can('timesheets:write') &&
    (sheet.status === 'DRAFT' || sheet.status === 'REJECTED') &&
    (user?.employeeId === sheet.employee.id ||
      (user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'HR_MANAGER') ?? false));
  const canDecide = can('timesheets:approve') && sheet.status === 'SUBMITTED';

  const days = weekDates(sheet.weekStart);
  const inDeployment = (d: string) =>
    d >= sheet.deploymentStart && (!sheet.deploymentEnd || d <= sheet.deploymentEnd);
  const [hours, setHours] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (sheet.entries ?? []).map((e) => [e.date, String(Math.round((e.minutes / 60) * 100) / 100)]),
    ),
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries((sheet.entries ?? []).map((e) => [e.date, e.note ?? ''])),
  );
  const minutes = (d: string) => Math.round(Number(hours[d] || 0) * 60);
  const totalMinutes = days.reduce((sum, d) => sum + minutes(d), 0);
  const invalid = days.find((d) => {
    const m = minutes(d);
    return Number.isNaN(m) || m < 0 || m > MAX_DAILY_MINUTES;
  });

  const entries = () =>
    days
      .filter((d) => inDeployment(d) && (minutes(d) > 0 || notes[d]))
      .map((d) => ({ date: d, minutes: minutes(d), note: notes[d] || undefined }));

  const persist = async () => {
    const saved = await save.mutateAsync({
      id: sheet.id,
      input: { version: sheet.version, entries: entries() },
    });
    return saved;
  };

  const onSave = async () => {
    try {
      await persist();
      toast.success('Saved.');
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const onSubmit = async () => {
    try {
      const saved = await persist();
      await act.mutateAsync({ id: sheet.id, action: 'submit', version: saved.version });
      toast.success('Submitted for approval.');
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const busy = save.isPending || act.isPending;

  return (
    <>
      <Link
        to="/timesheets"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All timesheets
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Week of {sheet.weekStart}
            <TimesheetStatusBadge status={sheet.status} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sheet.employee.name} · {sheet.client.name} · {sheet.project}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              <Button
                variant="outline"
                disabled={busy || Boolean(invalid)}
                onClick={() => void onSave()}
              >
                Save draft
              </Button>
              <Button
                disabled={busy || Boolean(invalid) || totalMinutes === 0}
                onClick={() => void onSubmit()}
              >
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                Submit
              </Button>
            </>
          )}
          {canDecide && (
            <>
              <Button
                disabled={busy}
                onClick={async () => {
                  try {
                    await act.mutateAsync({
                      id: sheet.id,
                      action: 'approve',
                      version: sheet.version,
                    });
                    toast.success('Timesheet approved.');
                  } catch (error) {
                    toast.error(errorText(error));
                  }
                }}
              >
                <Check aria-hidden />
                Approve
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                <X aria-hidden />
                Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {sheet.status === 'REJECTED' && sheet.rejectComment && (
        <p
          role="note"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
        >
          Returned by {sheet.decidedBy?.name ?? 'the approver'}: “{sheet.rejectComment}”
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <caption className="sr-only">Hours per day</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">
                  Day
                </th>
                <th scope="col" className="w-28 pb-2 font-medium">
                  Hours
                </th>
                <th scope="col" className="hidden pb-2 font-medium sm:table-cell">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => {
                const active = inDeployment(d);
                const m = minutes(d);
                const bad = Number.isNaN(m) || m < 0 || m > MAX_DAILY_MINUTES;
                return (
                  <tr key={d} className="border-b last:border-0">
                    <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">
                      <span className="font-medium">{DAY_NAMES[i]}</span>{' '}
                      <span className="text-muted-foreground">{d.slice(5)}</span>
                    </th>
                    <td className="py-2 pr-3">
                      {editable && active ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={16}
                          step={0.25}
                          aria-label={`Hours on ${DAY_NAMES[i]} ${d}`}
                          aria-invalid={bad ? true : undefined}
                          value={hours[d] ?? ''}
                          onChange={(e) => setHours((h) => ({ ...h, [d]: e.target.value }))}
                        />
                      ) : (
                        <span className="tabular-nums">
                          {active ? (
                            formatMinutes(m)
                          ) : (
                            <span className="text-muted-foreground">Not deployed</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="hidden py-2 sm:table-cell">
                      {editable && active ? (
                        <Input
                          aria-label={`Note for ${DAY_NAMES[i]} ${d}`}
                          maxLength={200}
                          value={notes[d] ?? ''}
                          onChange={(e) => setNotes((n) => ({ ...n, [d]: e.target.value }))}
                        />
                      ) : (
                        <span className="text-muted-foreground">{notes[d] ?? ''}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="pt-3 text-left">
                  Total
                </th>
                <td className="pt-3 font-semibold tabular-nums">{formatMinutes(totalMinutes)}</td>
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </table>
          {invalid && (
            <p className="mt-3 text-sm text-destructive">Hours per day must be between 0 and 16.</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            {sheet.submittedAt && `Submitted ${formatDateTime(sheet.submittedAt)}. `}
            {sheet.decidedAt &&
              `${sheet.status === 'REJECTED' ? 'Returned' : 'Approved'} ${formatDateTime(sheet.decidedAt)}${
                sheet.decidedBy ? ` by ${sheet.decidedBy.name}` : ''
              }.`}
          </p>
        </CardContent>
      </Card>

      <ActionDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Return this timesheet"
        description="The employee can correct it and submit again."
        confirmLabel="Return"
        destructive
        note={{ label: 'What needs changing', required: true }}
        onConfirm={async (comment) => {
          try {
            await act.mutateAsync({
              id: sheet.id,
              action: 'reject',
              version: sheet.version,
              comment,
            });
            toast.success('Timesheet returned.');
          } catch (error) {
            toast.error(errorText(error));
          }
        }}
      />
    </>
  );
}
