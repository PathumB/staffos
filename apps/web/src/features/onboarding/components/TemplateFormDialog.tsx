import { zodResolver } from '@hookform/resolvers/zod';
import {
  JOB_CATEGORY_LABELS,
  ONBOARDING_TASK_TYPE_LABELS,
  type OnboardingTemplate,
  ROLE_LABELS,
  templateInputSchema,
} from '@staffos/shared';
import { Loader2, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
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
import { optionalNumber } from '@/lib/list-params';
import { useSaveTemplate } from '../api';

type Values = z.input<typeof templateInputSchema>;

const blankTask = {
  title: '',
  type: 'DOCUMENTS',
  assigneeRole: 'HR_MANAGER',
  dueOffsetDays: 0,
  required: true,
} as const;

/** US-ONB-01: edit a checklist template. Existing plans keep the tasks they were created with. */
export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: OnboardingTemplate;
}) {
  const save = useSaveTemplate();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>({
    resolver: zodResolver(templateInputSchema),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'tasks' });
  const e = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      template
        ? {
            name: template.name,
            category: template.category,
            active: template.active,
            tasks: template.tasks.map((t) => ({
              title: t.title,
              description: t.description ?? '',
              type: t.type,
              assigneeRole: t.assigneeRole === 'EMPLOYEE' ? 'EMPLOYEE' : 'HR_MANAGER',
              dueOffsetDays: t.dueOffsetDays,
              required: t.required,
            })),
          }
        : { name: '', category: null, active: true, tasks: [{ ...blankTask }] },
    );
  }, [open, template, reset]);

  const close = (next: boolean) => {
    if (!next) setServerError(null);
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id: template?.id, input: values });
      toast.success(
        template ? 'Checklist saved. Existing plans are unchanged.' : 'Checklist created.',
      );
      close(false);
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
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit checklist' : 'New checklist'}</DialogTitle>
          <DialogDescription>
            Due dates are counted from the employee&apos;s start date (negative = before they
            start).
          </DialogDescription>
        </DialogHeader>
        <form id="template-form" onSubmit={onSubmit} noValidate className="grid gap-4">
          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" error={e.name?.message}>
              {(p) => <Input {...p} {...register('name')} />}
            </FormField>
            <FormField
              label="Job category"
              error={e.category?.message}
              hint="One checklist per category; Default is used otherwise."
            >
              {(p) => (
                <NativeSelect
                  {...p}
                  {...register('category', { setValueAs: (v) => (v === '' ? null : v) })}
                >
                  <option value="">Default (all other categories)</option>
                  {Object.entries(JOB_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" {...register('active')} />
            Active (used for new hires)
          </label>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">Tasks</legend>
            {fields.map((f, i) => {
              const te = e.tasks?.[i];
              return (
                <div
                  key={f.id}
                  className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_9rem_9rem_6rem_auto]"
                >
                  <div className="grid gap-1">
                    <Input
                      aria-label={`Task ${i + 1} title`}
                      placeholder="Task"
                      {...register(`tasks.${i}.title`)}
                    />
                    {te?.title && <p className="text-xs text-destructive">{te.title.message}</p>}
                  </div>
                  <NativeSelect aria-label={`Task ${i + 1} type`} {...register(`tasks.${i}.type`)}>
                    {Object.entries(ONBOARDING_TASK_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label={`Task ${i + 1} assigned to`}
                    {...register(`tasks.${i}.assigneeRole`)}
                  >
                    <option value="HR_MANAGER">{ROLE_LABELS.HR_MANAGER}</option>
                    <option value="EMPLOYEE">{ROLE_LABELS.EMPLOYEE}</option>
                  </NativeSelect>
                  <div className="grid gap-1">
                    <Input
                      aria-label={`Task ${i + 1} due (days from start)`}
                      type="number"
                      min={-90}
                      max={180}
                      {...register(`tasks.${i}.dueOffsetDays`, { setValueAs: optionalNumber })}
                    />
                    {te?.dueOffsetDays && (
                      <p className="text-xs text-destructive">{te.dueOffsetDays.message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        {...register(`tasks.${i}.required`)}
                      />
                      Required
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove task ${i + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => remove(i)}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}
            {e.tasks?.message && <p className="text-xs text-destructive">{e.tasks.message}</p>}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => append({ ...blankTask })}
            >
              <Plus aria-hidden />
              Add task
            </Button>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="template-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
