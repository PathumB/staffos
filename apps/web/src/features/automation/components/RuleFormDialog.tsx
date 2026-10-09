import { zodResolver } from '@hookform/resolvers/zod';
import {
  ACTION_LABELS,
  AUTOMATION_EMAIL_TEMPLATES,
  AUTOMATION_EVENT_FIELDS,
  AUTOMATION_EVENT_LABELS,
  type AutomationAction,
  type AutomationActionType,
  type AutomationRule,
  automationRuleInputSchema,
  CONDITION_OP_LABELS,
  CONDITION_OPS,
  RECIPIENT_LABELS,
  RECIPIENTS,
  ROLE_LABELS,
  RoleCode,
} from '@staffos/shared';
import { Loader2, Plus, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
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
import { useAssignableUsers } from '../../onboarding/api';
import { useSaveRule, useWebhooks, useWorkflows } from '../api';

type Values = z.input<typeof automationRuleInputSchema>;

/** A fresh action of the chosen type (switching type replaces the whole action). */
function blankAction(type: AutomationActionType): AutomationAction {
  switch (type) {
    case 'create_task':
      return { type, title: '', assigneeRole: 'HR_MANAGER', dueInDays: 3 };
    case 'send_email':
      return { type, template: 'employee_hired', to: 'hr' };
    case 'notify':
      return { type, to: 'hr', message: '' };
    case 'assign_user':
      return { type, userId: '' };
    case 'start_approval':
      return { type, workflowId: '' };
    case 'call_webhook':
      return { type, webhookId: '' };
  }
}

/** `in` takes a comma-separated list in the form; everything else a single value. */
const toFormValue = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));
const toApiValue = (op: string, v: unknown) =>
  op === 'in'
    ? String(v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : v;

/** US-AUTO-01: When [event] If [conditions, all must match] Then [actions], without code. */
export function RuleFormDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: AutomationRule;
}) {
  const save = useSaveRule();
  const workflows = useWorkflows(open);
  const webhooks = useWebhooks(open);
  const users = useAssignableUsers(open);
  const recipientsId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>({
    resolver: zodResolver(automationRuleInputSchema),
  });
  const conditions = useFieldArray({ control, name: 'conditions' });
  const actions = useFieldArray({ control, name: 'actions' });
  const event = useWatch({ control, name: 'event' }) ?? 'EMPLOYEE_HIRED';
  const actionValues = useWatch({ control, name: 'actions' }) ?? [];
  const e = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      rule
        ? {
            name: rule.name,
            active: rule.active,
            event: rule.event,
            conditions: rule.conditions.map((c) => ({ ...c, value: toFormValue(c.value) })),
            actions: rule.actions,
          }
        : {
            name: '',
            active: true,
            event: 'EMPLOYEE_HIRED',
            conditions: [],
            actions: [blankAction('create_task')],
          },
    );
  }, [open, rule, reset]);

  const close = (next: boolean) => {
    if (!next) setServerError(null);
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = {
        ...values,
        conditions: (values.conditions ?? []).map((c) => ({
          ...c,
          value: toApiValue(c.op, c.value),
        })),
      } as Values;
      await save.mutateAsync({ id: rule?.id, input });
      toast.success(rule ? 'Rule saved.' : 'Rule created.');
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

  const fields = AUTOMATION_EVENT_FIELDS[event];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit rule' : 'New automation rule'}</DialogTitle>
          <DialogDescription>
            Use {'{{field}}'} in texts to insert event data, e.g. {'{{candidateName}}'}. Rules run
            in the background; every run is logged.
          </DialogDescription>
        </DialogHeader>
        <form id="rule-form" onSubmit={onSubmit} noValidate className="grid gap-5">
          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
            <FormField label="Name" error={e.name?.message}>
              {(p) => <Input {...p} {...register('name')} />}
            </FormField>
            <FormField label="When" error={e.event?.message}>
              {(p) => (
                <NativeSelect {...p} {...register('event')}>
                  {Object.entries(AUTOMATION_EVENT_LABELS).map(([value, label]) => (
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
            Active
          </label>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">If (all must match)</legend>
            {conditions.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">No conditions: runs on every event.</p>
            )}
            {conditions.fields.map((f, i) => (
              <div key={f.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
                <NativeSelect
                  aria-label={`Condition ${i + 1} field`}
                  {...register(`conditions.${i}.field`)}
                >
                  {fields.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label={`Condition ${i + 1} operator`}
                  {...register(`conditions.${i}.op`)}
                >
                  {CONDITION_OPS.map((op) => (
                    <option key={op} value={op}>
                      {CONDITION_OP_LABELS[op]}
                    </option>
                  ))}
                </NativeSelect>
                <div className="grid gap-1">
                  <Input
                    aria-label={`Condition ${i + 1} value`}
                    placeholder="Value (comma-separated for “is one of”)"
                    {...register(`conditions.${i}.value`)}
                  />
                  {e.conditions?.[i]?.value && (
                    <p className="text-xs text-destructive">{e.conditions[i]?.value?.message}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove condition ${i + 1}`}
                  onClick={() => conditions.remove(i)}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={conditions.fields.length >= 10}
              onClick={() => conditions.append({ field: fields[0] ?? 'id', op: 'eq', value: '' })}
            >
              <Plus aria-hidden />
              Add condition
            </Button>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">Then</legend>
            <datalist id={recipientsId}>
              {RECIPIENTS.map((r) => (
                <option key={r} value={r}>
                  {RECIPIENT_LABELS[r]}
                </option>
              ))}
            </datalist>
            {actions.fields.map((f, i) => {
              const type = actionValues[i]?.type ?? f.type;
              const ae = e.actions?.[i] as
                Record<string, { message?: string } | undefined> | undefined;
              const err = (k: string) =>
                ae?.[k]?.message && <p className="text-xs text-destructive">{ae[k]?.message}</p>;
              return (
                <div key={f.id} className="grid gap-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <NativeSelect
                      aria-label={`Action ${i + 1} type`}
                      className="sm:max-w-64"
                      value={type}
                      onChange={(ev) =>
                        actions.update(i, blankAction(ev.target.value as AutomationActionType))
                      }
                    >
                      {Object.entries(ACTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto"
                      aria-label={`Remove action ${i + 1}`}
                      disabled={actions.fields.length === 1}
                      onClick={() => actions.remove(i)}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                  {type === 'create_task' && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_12rem_7rem]">
                      <div className="grid gap-1">
                        <Input
                          aria-label={`Action ${i + 1} task title`}
                          placeholder="Task title, e.g. Call {{candidateName}}"
                          {...register(`actions.${i}.title` as const)}
                        />
                        {err('title')}
                      </div>
                      <NativeSelect
                        aria-label={`Action ${i + 1} assignee role`}
                        {...register(`actions.${i}.assigneeRole` as const)}
                      >
                        {Object.values(RoleCode)
                          .filter((r) => r !== 'CLIENT_USER' && r !== 'EMPLOYEE')
                          .map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                      </NativeSelect>
                      <Input
                        aria-label={`Action ${i + 1} due in days`}
                        type="number"
                        min={0}
                        max={365}
                        {...register(`actions.${i}.dueInDays` as const, {
                          setValueAs: (v) => (v === '' || v === undefined ? undefined : Number(v)),
                        })}
                      />
                    </div>
                  )}
                  {type === 'send_email' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <NativeSelect
                        aria-label={`Action ${i + 1} email template`}
                        {...register(`actions.${i}.template` as const)}
                      >
                        {Object.entries(AUTOMATION_EMAIL_TEMPLATES).map(([key, t]) => (
                          <option key={key} value={key}>
                            {t.label}
                          </option>
                        ))}
                      </NativeSelect>
                      <div className="grid gap-1">
                        <Input
                          aria-label={`Action ${i + 1} send to`}
                          list={recipientsId}
                          placeholder="account_manager, hr, recruiter or an email"
                          {...register(`actions.${i}.to` as const)}
                        />
                        {err('to')}
                      </div>
                    </div>
                  )}
                  {type === 'notify' && (
                    <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
                      <NativeSelect
                        aria-label={`Action ${i + 1} notify`}
                        {...register(`actions.${i}.to` as const)}
                      >
                        {RECIPIENTS.map((r) => (
                          <option key={r} value={r}>
                            {RECIPIENT_LABELS[r]}
                          </option>
                        ))}
                      </NativeSelect>
                      <div className="grid gap-1">
                        <Input
                          aria-label={`Action ${i + 1} message`}
                          placeholder="Message"
                          {...register(`actions.${i}.message` as const)}
                        />
                        {err('message')}
                      </div>
                    </div>
                  )}
                  {type === 'assign_user' && (
                    <div className="grid gap-1">
                      <NativeSelect
                        aria-label={`Action ${i + 1} user`}
                        {...register(`actions.${i}.userId` as const)}
                      >
                        <option value="">Choose a user…</option>
                        {users.data?.data.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName}
                          </option>
                        ))}
                      </NativeSelect>
                      <p className="text-xs text-muted-foreground">
                        Assigns the tasks this rule created (or a follow-up task).
                      </p>
                      {err('userId')}
                    </div>
                  )}
                  {type === 'start_approval' && (
                    <div className="grid gap-1">
                      <NativeSelect
                        aria-label={`Action ${i + 1} workflow`}
                        {...register(`actions.${i}.workflowId` as const)}
                      >
                        <option value="">Choose an approval chain…</option>
                        {workflows.data
                          ?.filter((w) => w.subject === 'MANPOWER_REQUEST')
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                              {w.active ? '' : ' (inactive)'}
                            </option>
                          ))}
                      </NativeSelect>
                      <p className="text-xs text-muted-foreground">
                        For “Manpower request created”: the request then needs this chain’s
                        approval.
                      </p>
                      {err('workflowId')}
                    </div>
                  )}
                  {type === 'call_webhook' && (
                    <div className="grid gap-1">
                      <NativeSelect
                        aria-label={`Action ${i + 1} webhook`}
                        {...register(`actions.${i}.webhookId` as const)}
                      >
                        <option value="">Choose an endpoint…</option>
                        {webhooks.data?.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.url}
                          </option>
                        ))}
                      </NativeSelect>
                      {err('webhookId')}
                    </div>
                  )}
                </div>
              );
            })}
            {e.actions?.message && <p className="text-xs text-destructive">{e.actions.message}</p>}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={actions.fields.length >= 10}
              onClick={() => actions.append(blankAction('notify'))}
            >
              <Plus aria-hidden />
              Add action
            </Button>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rule-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
