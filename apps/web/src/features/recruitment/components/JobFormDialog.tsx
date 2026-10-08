import { zodResolver } from '@hookform/resolvers/zod';
import { EMIRATE_LABELS, type Job, jobCreateSchema, type ManpowerRequest } from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { MoneyInput } from '@/components/money-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { optionalNumber } from '@/lib/list-params';
import { JdDraftAssist } from '@/features/ai/components/JdDraftAssist';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSaveJob, useStaff } from '../api';
import { SkillsEditor } from './SkillsEditor';

type Values = z.input<typeof jobCreateSchema>;

/** Open a job from an approved request, or edit an existing job. */
export function JobFormDialog({
  open,
  onOpenChange,
  request,
  job,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: ManpowerRequest;
  job?: Job;
}) {
  const save = useSaveJob();
  const navigate = useNavigate();
  const recruiters = useStaff('RECRUITER', open);
  const managers = useStaff('HIRING_MANAGER', open);
  const [serverError, setServerError] = useState<string | null>(null);
  const { can } = useAuth();
  const { register, control, handleSubmit, reset, setError, getValues, setValue, formState } =
    useForm<Values>({
      resolver: zodResolver(jobCreateSchema),
    });
  const e = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      job
        ? {
            manpowerRequestId: job.manpowerRequestId,
            title: job.title,
            description: job.description ?? '',
            location: job.location,
            emirate: job.emirate,
            headcount: job.headcount,
            salaryMinFils: job.salaryMinFils ?? undefined,
            salaryMaxFils: job.salaryMaxFils ?? undefined,
            showClientName: job.showClientName,
            recruiterIds: job.recruiters.map((r) => r.id),
            hiringManagerId: job.hiringManager.id,
            skills: job.skills.map((s) => ({
              name: s.name,
              weight: s.weight,
              minYears: s.minYears ?? undefined,
            })),
          }
        : {
            manpowerRequestId: request?.id ?? '',
            title: request?.roleTitle ?? '',
            description: '',
            location: request?.location ?? '',
            emirate: request?.emirate ?? 'DUBAI',
            headcount: request?.headcount ?? 1,
            showClientName: false,
            recruiterIds: [],
            hiringManagerId: '',
            skills: [],
          },
    );
  }, [open, job, request, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const parsed = jobCreateSchema.parse(values);
      if (job) {
        const { manpowerRequestId: _r, ...fields } = parsed;
        await save.mutateAsync({ id: job.id, input: { ...fields, version: job.version } });
        toast.success('Job updated.');
      } else {
        const created = await save.mutateAsync({ input: parsed });
        toast.success('Job opened as a draft. Publish it when ready.');
        navigate(`/jobs/${created.id}`);
      }
      setServerError(null);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [f, m] of Object.entries(error.fieldErrors))
          setError(f as keyof Values, { message: m[0] });
        setServerError(
          error.code === 'STALE_VERSION'
            ? 'Someone else changed this job. Close and reopen to see the latest.'
            : error.message,
        );
      } else {
        setServerError('Something went wrong. Please try again.');
      }
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{job ? 'Edit job' : 'Open job'}</DialogTitle>
          <DialogDescription>
            {job
              ? 'Changes are audited.'
              : `From the approved request for ${request?.client.name ?? 'the client'}.`}
          </DialogDescription>
        </DialogHeader>
        <form id="job-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
            >
              {serverError}
            </p>
          )}
          <FormField label="Job title" error={e.title?.message} className="sm:col-span-2">
            {(p) => <Input {...p} {...register('title')} />}
          </FormField>
          <FormField label="Location" error={e.location?.message}>
            {(p) => <Input {...p} {...register('location')} />}
          </FormField>
          <FormField label="Emirate" error={e.emirate?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('emirate')}>
                {Object.entries(EMIRATE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Headcount" error={e.headcount?.message}>
            {(p) => (
              <Input
                {...p}
                {...register('headcount', { setValueAs: optionalNumber })}
                type="number"
                min={1}
              />
            )}
          </FormField>
          <FormField label="Hiring manager" error={e.hiringManagerId?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('hiringManagerId')} disabled={managers.isPending}>
                <option value="">{managers.isPending ? 'Loading…' : 'Select'}</option>
                {managers.data?.data.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          {(['salaryMinFils', 'salaryMaxFils'] as const).map((name) => (
            <FormField
              key={name}
              label={name === 'salaryMinFils' ? 'Salary min (AED/month)' : 'Salary max (AED/month)'}
              error={e[name]?.message}
            >
              {(p) => (
                <Controller
                  control={control}
                  name={name}
                  render={({ field }) => (
                    <MoneyInput
                      {...p}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              )}
            </FormField>
          ))}
          <Controller
            control={control}
            name="recruiterIds"
            render={({ field }) => (
              <fieldset className="grid gap-2 sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">Recruiters</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {recruiters.data?.data.map((u) => (
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
                      {u.firstName} {u.lastName}
                    </label>
                  ))}
                  {recruiters.isPending && (
                    <span className="text-sm text-muted-foreground">Loading…</span>
                  )}
                </div>
                {e.recruiterIds && (
                  <p className="text-xs text-destructive">{e.recruiterIds.message}</p>
                )}
              </fieldset>
            )}
          />
          <div className="sm:col-span-2">
            <SkillsEditor
              control={control}
              register={register}
              name="skills"
              mode="job"
              error={e.skills?.message}
            />
          </div>
          <FormField
            label="Description"
            error={e.description?.message}
            className="sm:col-span-2"
            hint="Shown on the careers portal."
          >
            {(p) => <Textarea {...p} {...register('description')} className="min-h-28" />}
          </FormField>
          {can('ai:use') && (
            <JdDraftAssist
              className="sm:col-span-2"
              getInput={() => {
                const v = getValues();
                return {
                  title: v.title ?? '',
                  location: v.location,
                  skills: (v.skills ?? []).map((s) => s.name).filter(Boolean),
                };
              }}
              onDraft={(draft) => setValue('description', draft, { shouldDirty: true })}
            />
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              {...register('showClientName')}
            />
            Show the client&apos;s name on the careers portal
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="job-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {job ? 'Save changes' : 'Open job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
