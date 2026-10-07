import { zodResolver } from '@hookform/resolvers/zod';
import { type Client, clientInputSchema, EMIRATE_LABELS, INDUSTRY_LABELS } from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
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
import { useSaveClient } from '../api';

type Values = z.input<typeof clientInputSchema>;
const empty: Values = {
  name: '',
  industry: 'CONSTRUCTION',
  trn: '',
  city: '',
  emirate: 'DUBAI',
  addressLine1: '',
  vatRateBps: 500,
  paymentTermsDays: 30,
  status: 'ACTIVE',
};

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
}) {
  const save = useSaveClient();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState } = useForm<Values>({
    resolver: zodResolver(clientInputSchema),
    defaultValues: empty,
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      client
        ? {
            name: client.name,
            industry: client.industry,
            trn: client.trn ?? '',
            city: client.city,
            emirate: client.emirate,
            addressLine1: client.addressLine1 ?? '',
            vatRateBps: client.vatRateBps,
            paymentTermsDays: client.paymentTermsDays,
            status: client.status,
          }
        : empty,
    );
  }, [open, client, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = clientInputSchema.parse(values);
      const saved = await save.mutateAsync({ id: client?.id, input });
      toast.success(client ? 'Client updated.' : 'Client created.');
      onOpenChange(false);
      if (!client) navigate(`/clients/${saved.id}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'CLIENT_TRN_EXISTS') return setError('trn', { message: error.message });
        for (const [field, messages] of Object.entries(error.fieldErrors))
          setError(field as keyof Values, { message: messages[0] });
        setServerError(error.message);
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
          <DialogTitle>{client ? 'Edit client' : 'New client'}</DialogTitle>
          <DialogDescription>
            {client
              ? 'Changes are recorded in the audit log.'
              : 'You become the account manager for this client.'}
          </DialogDescription>
        </DialogHeader>
        <form id="client-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
            >
              {serverError}
            </p>
          )}
          <FormField label="Company name" error={errors.name?.message} className="sm:col-span-2">
            {(p) => <Input {...p} {...register('name')} />}
          </FormField>
          <FormField label="Industry" error={errors.industry?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('industry')}>
                {Object.entries(INDUSTRY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            label="TRN"
            error={errors.trn?.message}
            hint="15-digit UAE tax registration number"
          >
            {(p) => <Input {...p} {...register('trn')} inputMode="numeric" maxLength={15} />}
          </FormField>
          <FormField label="Address" error={errors.addressLine1?.message} className="sm:col-span-2">
            {(p) => <Input {...p} {...register('addressLine1')} />}
          </FormField>
          <FormField label="City" error={errors.city?.message}>
            {(p) => <Input {...p} {...register('city')} />}
          </FormField>
          <FormField label="Emirate" error={errors.emirate?.message}>
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
          <FormField label="VAT" error={errors.vatRateBps?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('vatRateBps', { setValueAs: Number })}>
                <option value={500}>5% (standard rate)</option>
                <option value={0}>0% (zero-rated, e.g. free zone)</option>
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Payment terms (days)" error={errors.paymentTermsDays?.message}>
            {(p) => (
              <Input
                {...p}
                {...register('paymentTermsDays', { setValueAs: optionalNumber })}
                type="number"
                min={0}
                max={365}
              />
            )}
          </FormField>
          {client && (
            <FormField label="Status" error={errors.status?.message}>
              {(p) => (
                <NativeSelect {...p} {...register('status')}>
                  <option value="PROSPECT">Prospect</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </NativeSelect>
              )}
            </FormField>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="client-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {client ? 'Save changes' : 'Create client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
