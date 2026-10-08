import {
  INTERVIEW_MODE_LABELS,
  type Interview,
  type InterviewMode,
  interviewUpdateSchema,
} from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { usePanelOptions, useSaveInterview } from '../api';

type Values = {
  date: string;
  time: string;
  durationMin: string;
  mode: InterviewMode;
  location: string;
  meetingUrl: string;
  interviewerIds: string[];
};

// Interviews are planned in UAE time (no daylight saving), whatever the browser's time zone.
const dubaiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' });
const dubaiTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const FIELD_FOR: Record<string, keyof Values> = {
  scheduledAt: 'date',
  durationMin: 'durationMin',
  location: 'location',
  meetingUrl: 'meetingUrl',
  interviewerIds: 'interviewerIds',
};

/** Schedule (with `applicationId`) or reschedule (with `interview`). */
export function InterviewFormDialog({
  open,
  onOpenChange,
  applicationId,
  interview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  interview?: Interview;
}) {
  const save = useSaveInterview();
  const panel = usePanelOptions(open);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>();
  const e = formState.errors;
  const mode = useWatch({ control, name: 'mode' });

  useEffect(() => {
    if (!open) return;
    const at = interview ? new Date(interview.scheduledAt) : null;
    reset({
      date: at ? dubaiDate.format(at) : '',
      time: at ? dubaiTime.format(at) : '10:00',
      durationMin: String(interview?.durationMin ?? 45),
      mode: interview?.mode ?? 'ONSITE',
      location: interview?.location ?? '',
      meetingUrl: interview?.meetingUrl ?? '',
      interviewerIds: interview?.interviewers.map((i) => i.id) ?? [],
    });
  }, [open, interview, reset]);

  const onSubmit = handleSubmit(async (v) => {
    if (!v.date) {
      setError('date', { message: 'Choose a date.' });
      return;
    }
    // Same validation as the API (shared schema); map its paths back to the form fields.
    const parsed = interviewUpdateSchema.safeParse({
      scheduledAt: `${v.date}T${v.time || '00:00'}:00+04:00`,
      durationMin: Number(v.durationMin),
      mode: v.mode,
      location: v.location,
      meetingUrl: v.meetingUrl,
      interviewerIds: v.interviewerIds,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = FIELD_FOR[String(issue.path[0])];
        if (field) setError(field, { message: issue.message });
      }
      return;
    }
    try {
      await save.mutateAsync(
        interview
          ? { id: interview.id, input: parsed.data }
          : { input: { ...parsed.data, applicationId } },
      );
      toast.success(
        interview ? 'Interview updated. Invites re-sent.' : 'Interview scheduled. Invites sent.',
      );
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof ApiClientError ? error.message : 'Something went wrong. Please try again.',
      );
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{interview ? 'Reschedule interview' : 'Schedule interview'}</DialogTitle>
          <DialogDescription>
            Times are in Dubai time. The candidate and each interviewer get a calendar invite.
          </DialogDescription>
        </DialogHeader>
        <form
          id="interview-form"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
        >
          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
            >
              {serverError}
            </p>
          )}
          <FormField label="Date" error={e.date?.message}>
            {(p) => <Input {...p} type="date" {...register('date')} />}
          </FormField>
          <FormField label="Time (Dubai)" error={e.time?.message}>
            {(p) => <Input {...p} type="time" step={900} {...register('time')} />}
          </FormField>
          <FormField label="Duration" error={e.durationMin?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('durationMin')}>
                {[30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Format" error={e.mode?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('mode')}>
                {Object.entries(INTERVIEW_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            label={mode === 'ONSITE' ? 'Location' : 'Location (optional)'}
            error={e.location?.message}
          >
            {(p) => (
              <Input {...p} {...register('location')} placeholder="e.g. Business Bay office" />
            )}
          </FormField>
          <FormField label="Meeting link (optional)" error={e.meetingUrl?.message}>
            {(p) => <Input {...p} type="url" {...register('meetingUrl')} placeholder="https://…" />}
          </FormField>
          <Controller
            control={control}
            name="interviewerIds"
            render={({ field }) => (
              <fieldset className="grid gap-2 sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">Interviewers</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {panel.data?.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={field.value?.includes(u.id) ?? false}
                        onChange={(ev) =>
                          field.onChange(
                            ev.target.checked
                              ? [...(field.value ?? []), u.id]
                              : (field.value ?? []).filter((id) => id !== u.id),
                          )
                        }
                      />
                      <span>
                        {u.name} <span className="text-muted-foreground">· {u.role}</span>
                      </span>
                    </label>
                  ))}
                  {panel.isPending && (
                    <span className="text-sm text-muted-foreground">Loading…</span>
                  )}
                  {panel.error && (
                    <span className="text-sm text-destructive">
                      Couldn&apos;t load interviewers.
                    </span>
                  )}
                </div>
                {e.interviewerIds && (
                  <p className="text-xs text-destructive">{e.interviewerIds.message}</p>
                )}
              </fieldset>
            )}
          />
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setServerError(null);
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" form="interview-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {interview ? 'Save and re-send' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
