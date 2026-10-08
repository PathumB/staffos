import { zodResolver } from '@hookform/resolvers/zod';
import { CONTRACT_TYPE_LABELS, offerCreateSchema } from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
import { useCreateOffer } from '../api';

type Values = z.input<typeof offerCreateSchema>;

/** US-OFFER-01: a recruiter drafts the offer; it then waits for the hiring manager's approval. */
export function OfferFormDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateName: string;
}) {
  const create = useCreateOffer();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, reset, setError, setValue, formState } = useForm<Values>(
    { resolver: zodResolver(offerCreateSchema) },
  );
  const e = formState.errors;
  const contractType = useWatch({ control, name: 'contractType' });

  useEffect(() => {
    if (!open) return;
    reset({ applicationId, contractType: 'FIXED_TERM', contractMonths: 24, currency: 'AED' });
  }, [open, applicationId, reset]);

  // Permanent contracts have no length; clear it so the shared rule passes.
  useEffect(() => {
    if (contractType === 'PERMANENT') setValue('contractMonths', undefined);
  }, [contractType, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(offerCreateSchema.parse(values));
      toast.success('Offer created. The hiring manager has been asked to approve it.');
      onOpenChange(false);
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Offer for {candidateName}</DialogTitle>
          <DialogDescription>Amounts are monthly, in AED.</DialogDescription>
        </DialogHeader>
        <form id="offer-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
            >
              {serverError}
            </p>
          )}
          <FormField label="Salary (AED/month)" error={e.salaryFils?.message}>
            {(p) => (
              <Controller
                control={control}
                name="salaryFils"
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
          <FormField label="Start date" error={e.startDate?.message}>
            {(p) => <Input {...p} type="date" {...register('startDate')} />}
          </FormField>
          <FormField label="Contract" error={e.contractType?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('contractType')}>
                {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          {contractType !== 'PERMANENT' && (
            <FormField label="Length (months)" error={e.contractMonths?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={120}
                  {...register('contractMonths', { setValueAs: optionalNumber })}
                />
              )}
            </FormField>
          )}
          <FormField
            label="Notes (optional)"
            error={e.notes?.message}
            className="sm:col-span-2"
            hint="Benefits such as accommodation or transport."
          >
            {(p) => <Textarea {...p} {...register('notes')} />}
          </FormField>
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
          <Button type="submit" form="offer-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Create offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
