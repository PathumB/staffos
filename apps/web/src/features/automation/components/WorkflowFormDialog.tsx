import { zodResolver } from '@hookform/resolvers/zod';
import { ROLE_LABELS, type Workflow, workflowInputSchema } from '@staffos/shared';
import { ArrowDown, ArrowUp, Loader2, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
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
import { useSaveWorkflow } from '../api';

type Values = z.input<typeof workflowInputSchema>;

/** Roles that hold the approve permission for each subject (others can't act on the step). */
const APPROVER_ROLES = {
  MANPOWER_REQUEST: ['HR_MANAGER', 'SUPER_ADMIN'],
  OFFER: ['HIRING_MANAGER', 'HR_MANAGER', 'SUPER_ADMIN'],
} as const;

/** US-WF-01: an ordered approval chain, one approver role per step. */
export function WorkflowFormDialog({
  open,
  onOpenChange,
  workflow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow?: Workflow;
}) {
  const save = useSaveWorkflow();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>({
    resolver: zodResolver(workflowInputSchema),
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'steps' });
  const subject = useWatch({ control, name: 'subject' }) ?? 'MANPOWER_REQUEST';
  const e = formState.errors;
  const locked = Boolean(workflow && workflow.pendingCount > 0);

  useEffect(() => {
    if (!open) return;
    reset(
      workflow
        ? {
            name: workflow.name,
            subject: workflow.subject,
            active: workflow.active,
            steps: workflow.steps.map((s) => ({ name: s.name, approverRole: s.approverRole })),
          }
        : {
            name: '',
            subject: 'MANPOWER_REQUEST',
            active: true,
            steps: [{ name: 'HR Manager approval', approverRole: 'HR_MANAGER' }],
          },
    );
  }, [open, workflow, reset]);

  const close = (next: boolean) => {
    if (!next) setServerError(null);
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      // Steps can't change while approvals are pending (the API would refuse with 409).
      const input = locked ? { name: values.name, active: values.active } : values;
      await save.mutateAsync({ id: workflow?.id, input });
      toast.success(workflow ? 'Workflow saved.' : 'Workflow created.');
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
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workflow ? 'Edit approval chain' : 'New approval chain'}</DialogTitle>
          <DialogDescription>
            Steps run in order. A rejection at any step ends the approval. The newest active chain
            is used for each request or offer that needs approval.
          </DialogDescription>
        </DialogHeader>
        <form id="workflow-form" onSubmit={onSubmit} noValidate className="grid gap-4">
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
            <FormField label="Applies to" error={e.subject?.message}>
              {(p) => (
                <NativeSelect {...p} disabled={Boolean(workflow)} {...register('subject')}>
                  <option value="MANPOWER_REQUEST">Manpower requests</option>
                  <option value="OFFER">Offers</option>
                </NativeSelect>
              )}
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" {...register('active')} />
            Active
          </label>

          <fieldset className="grid gap-3" disabled={locked}>
            <legend className="mb-1 text-sm font-medium">Steps</legend>
            {locked && (
              <p className="text-xs text-muted-foreground">
                {workflow?.pendingCount} approval(s) are in progress, so the steps are locked.
              </p>
            )}
            {fields.map((f, i) => (
              <div
                key={f.id}
                className="grid items-start gap-2 rounded-md border p-3 sm:grid-cols-[2rem_1fr_12rem_auto]"
              >
                <span className="pt-2 text-sm font-medium tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <div className="grid gap-1">
                  <Input
                    aria-label={`Step ${i + 1} name`}
                    placeholder="e.g. Finance review"
                    {...register(`steps.${i}.name`)}
                  />
                  {e.steps?.[i]?.name && (
                    <p className="text-xs text-destructive">{e.steps[i]?.name?.message}</p>
                  )}
                </div>
                <NativeSelect
                  aria-label={`Step ${i + 1} approver role`}
                  {...register(`steps.${i}.approverRole`)}
                >
                  {APPROVER_ROLES[subject].map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </NativeSelect>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move step ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={i === fields.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove step ${i + 1}`}
                    disabled={fields.length === 1}
                    onClick={() => remove(i)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
            {e.steps?.message && <p className="text-xs text-destructive">{e.steps.message}</p>}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={fields.length >= 10}
              onClick={() => append({ name: '', approverRole: APPROVER_ROLES[subject][0] })}
            >
              <Plus aria-hidden />
              Add step
            </Button>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="workflow-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
