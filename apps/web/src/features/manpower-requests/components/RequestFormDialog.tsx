import { zodResolver } from '@hookform/resolvers/zod';
import {
  EMIRATE_LABELS,
  JOB_CATEGORY_LABELS,
  type ManpowerRequest,
  manpowerRequestInputSchema,
} from '@staffos/shared';
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
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { optionalNumber } from '@/lib/list-params';
import { useClients } from '../../clients/api';
import { useSaveRequest } from '../api';

type Values = z.input<typeof manpowerRequestInputSchema>;

const empty: Values = {
  clientId: undefined,
  roleTitle: '',
  category: 'DRIVER',
  headcount: 1,
  location: '',
  emirate: 'DUBAI',
  startDate: '',
  durationMonths: undefined,
  billRateMinFils: undefined,
  billRateMaxFils: undefined,
  requirements: '',
};

/** Create or edit a manpower request. Client users never pick a client (it's their own). */
export function RequestFormDialog({
  open,
  onOpenChange,
  request,
  clientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: ManpowerRequest;
  clientId?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const save = useSaveRequest();
  const isClientUser = Boolean(user?.clientId);
  const clients = useClients(
    { pageSize: 100, sort: 'name' },
    open && !isClientUser && !request && !clientId,
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(manpowerRequestInputSchema),
    defaultValues: empty,
  });
  const { register, control, handleSubmit, reset, setError, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      request
        ? {
            roleTitle: request.roleTitle,
            category: request.category,
            headcount: request.headcount,
            location: request.location,
            emirate: request.emirate,
            startDate: request.startDate,
            durationMonths: request.durationMonths ?? undefined,
            billRateMinFils: request.billRateMinFils ?? undefined,
            billRateMaxFils: request.billRateMaxFils ?? undefined,
            requirements: request.requirements ?? '',
          }
        : { ...empty, clientId },
    );
  }, [open, request, clientId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const parsed = manpowerRequestInputSchema.parse(values);
      if (request) {
        const { clientId: _ignored, ...fields } = parsed;
        await save.mutateAsync({ id: request.id, input: { ...fields, version: request.version } });
        toast.success('Request updated.');
      } else {
        const created = await save.mutateAsync({ input: parsed });
        toast.success(
          isClientUser
            ? 'Request sent to your account manager.'
            : 'Draft saved. Submit it when ready.',
        );
        navigate(`/requests/${created.id}`);
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          setError(field as keyof Values, { message: messages[0] });
        }
        setServerError(
          error.code === 'STALE_VERSION'
            ? 'Someone else changed this request. Close and reopen to see the latest.'
            : error.message,
        );
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{request ? 'Edit request' : 'New manpower request'}</DialogTitle>
          <DialogDescription>
            Requests for more than 20 people need HR Manager approval after submission.
          </DialogDescription>
        </DialogHeader>
        <form
          id="request-form"
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
          {!isClientUser && !request && !clientId && (
            <FormField label="Client" error={errors.clientId?.message} className="sm:col-span-2">
              {(p) => (
                <NativeSelect
                  {...p}
                  {...register('clientId', { setValueAs: (v) => v || undefined })}
                  disabled={clients.isPending}
                >
                  <option value="">
                    {clients.isPending ? 'Loading clients…' : 'Select a client'}
                  </option>
                  {clients.data?.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          )}
          <FormField label="Role title" error={errors.roleTitle?.message}>
            {(p) => <Input {...p} {...register('roleTitle')} placeholder="Heavy vehicle driver" />}
          </FormField>
          <FormField label="Category" error={errors.category?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('category')}>
                {Object.entries(JOB_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Headcount" error={errors.headcount?.message}>
            {(p) => (
              <Input
                {...p}
                {...register('headcount', { setValueAs: optionalNumber })}
                type="number"
                min={1}
                inputMode="numeric"
              />
            )}
          </FormField>
          <FormField label="Start date" error={errors.startDate?.message}>
            {(p) => <Input {...p} {...register('startDate')} type="date" />}
          </FormField>
          <FormField label="Location" error={errors.location?.message}>
            {(p) => <Input {...p} {...register('location')} placeholder="Jebel Ali" />}
          </FormField>
          <FormField label="Emirate" error={errors.emirate?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('emirate')}>
                {Object.entries(EMIRATE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            label="Duration (months)"
            error={errors.durationMonths?.message}
            hint="Leave empty if open-ended."
          >
            {(p) => (
              <Input
                {...p}
                {...register('durationMonths', { setValueAs: optionalNumber })}
                type="number"
                min={1}
                inputMode="numeric"
              />
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Bill rate min (AED/h)" error={errors.billRateMinFils?.message}>
              {(p) => (
                <Controller
                  control={control}
                  name="billRateMinFils"
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
            <FormField label="Bill rate max (AED/h)" error={errors.billRateMaxFils?.message}>
              {(p) => (
                <Controller
                  control={control}
                  name="billRateMaxFils"
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
          </div>
          <FormField
            label="Requirements"
            error={errors.requirements?.message}
            className="sm:col-span-2"
          >
            {(p) => (
              <Textarea
                {...p}
                {...register('requirements')}
                placeholder="Licences, experience, languages…"
              />
            )}
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="request-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {request ? 'Save changes' : isClientUser ? 'Send request' : 'Save draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
