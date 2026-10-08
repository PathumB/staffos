import { zodResolver } from '@hookform/resolvers/zod';
import { type Candidate, candidateCreateSchema } from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { useSaveCandidate } from '../api';
import { SkillsEditor } from './SkillsEditor';

type Values = z.input<typeof candidateCreateSchema>;

/** A profile suggested from an uploaded CV (US-CAND-01); the recruiter confirms or edits it. */
export type CandidateDraft = {
  values: Partial<Values>;
  cvToken: string;
  fileName: string;
  /** Fields the AI was unsure about (confidence < 0.7): highlighted for checking. */
  lowConfidence: ReadonlySet<string>;
  aiAssisted: boolean;
};

const CHECK = 'AI was unsure about this: please check.';
const LOW = 'rounded-md bg-warning/10 p-2 ring-1 ring-warning/40';
const empty: Values = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  currentTitle: '',
  summary: '',
  source: 'MANUAL',
  skills: [],
  languages: [],
};

export function CandidateFormDialog({
  open,
  onOpenChange,
  candidate,
  draft,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate?: Candidate;
  draft?: CandidateDraft;
  onSaved?: (candidate: Candidate) => void;
}) {
  const save = useSaveCandidate();
  const { user } = useAuth();
  const canForce = Boolean(user?.roles.some((r) => r === 'HR_MANAGER' || r === 'SUPER_ADMIN'));
  const [duplicate, setDuplicate] = useState<{ candidateId?: string } | null>(null);
  const { register, control, handleSubmit, reset, setError, getValues, formState } =
    useForm<Values>({
      resolver: zodResolver(candidateCreateSchema),
      defaultValues: empty,
    });
  const e = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      candidate
        ? {
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            email: candidate.email,
            phone: candidate.phone ?? '',
            location: candidate.location ?? '',
            currentTitle: candidate.currentTitle ?? '',
            totalExperienceMonths: candidate.totalExperienceMonths ?? undefined,
            summary: candidate.summary ?? '',
            skills: candidate.skills.map((s) => ({ name: s.name, years: s.years ?? undefined })),
            languages: candidate.languages,
          }
        : draft
          ? { ...empty, ...draft.values, cvToken: draft.cvToken }
          : empty,
    );
  }, [open, candidate, draft, reset]);

  const submit = async (values: Values, force = false) => {
    try {
      const parsed = candidateCreateSchema.parse(values);
      const { source: _s, ...update } = parsed;
      const saved = await save.mutateAsync(
        candidate ? { id: candidate.id, input: update } : { input: parsed, force },
      );
      toast.success(candidate ? 'Candidate updated.' : 'Candidate created.');
      setDuplicate(null);
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'CANDIDATE_DUPLICATE') {
          setDuplicate({ candidateId: error.error.details.candidateId as string | undefined });
          return;
        }
        for (const [f, m] of Object.entries(error.fieldErrors))
          setError(f as keyof Values, { message: m[0] });
      }
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not save the candidate.',
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDuplicate(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{candidate ? 'Edit candidate' : 'New candidate'}</DialogTitle>
        </DialogHeader>
        {draft && (
          <p
            role="note"
            className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          >
            {draft.aiAssisted ? (
              <>
                <strong>AI-assisted suggestion</strong> from {draft.fileName}. Check every field
                before saving; highlighted ones need a closer look.
              </>
            ) : (
              <>{draft.fileName} will be attached to the candidate. Please fill the fields.</>
            )}
          </p>
        )}
        <form
          id="candidate-form"
          onSubmit={handleSubmit((v) => submit(v))}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
        >
          {duplicate && (
            <div
              role="alert"
              className="grid gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm sm:col-span-2"
            >
              <p>A candidate with this email or phone already exists.</p>
              <div className="flex flex-wrap gap-2">
                {duplicate.candidateId && (
                  <Link
                    to={`/candidates/${duplicate.candidateId}`}
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    Open the existing profile
                  </Link>
                )}
                {canForce && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void submit(getValues(), true)}
                  >
                    Create anyway
                  </Button>
                )}
              </div>
            </div>
          )}
          <FormField
            label="First name"
            error={e.firstName?.message}
            hint={draft?.lowConfidence.has('firstName') ? CHECK : undefined}
            className={draft?.lowConfidence.has('firstName') ? LOW : undefined}
          >
            {(p) => <Input {...p} {...register('firstName')} />}
          </FormField>
          <FormField
            label="Last name"
            error={e.lastName?.message}
            hint={draft?.lowConfidence.has('lastName') ? CHECK : undefined}
            className={draft?.lowConfidence.has('lastName') ? LOW : undefined}
          >
            {(p) => <Input {...p} {...register('lastName')} />}
          </FormField>
          <FormField
            label="Email"
            error={e.email?.message}
            hint={draft?.lowConfidence.has('email') ? CHECK : undefined}
            className={draft?.lowConfidence.has('email') ? LOW : undefined}
          >
            {(p) => <Input {...p} {...register('email')} type="email" />}
          </FormField>
          <FormField
            label="Phone"
            error={e.phone?.message}
            hint={draft?.lowConfidence.has('phone') ? CHECK : undefined}
            className={draft?.lowConfidence.has('phone') ? LOW : undefined}
          >
            {(p) => <Input {...p} {...register('phone')} type="tel" />}
          </FormField>
          <FormField
            label="Current title"
            error={e.currentTitle?.message}
            hint={draft?.lowConfidence.has('currentTitle') ? CHECK : undefined}
            className={draft?.lowConfidence.has('currentTitle') ? LOW : undefined}
          >
            {(p) => <Input {...p} {...register('currentTitle')} />}
          </FormField>
          <FormField
            label="Experience (years)"
            error={e.totalExperienceMonths?.message}
            hint={draft?.lowConfidence.has('totalExperienceMonths') ? CHECK : undefined}
            className={draft?.lowConfidence.has('totalExperienceMonths') ? LOW : undefined}
          >
            {(p) => (
              <Controller
                control={control}
                name="totalExperienceMonths"
                // Stored in months (schema), edited in whole years.
                render={({ field }) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    max={60}
                    value={field.value === undefined ? '' : Math.round(field.value / 12)}
                    onBlur={field.onBlur}
                    onChange={(ev) =>
                      field.onChange(
                        ev.target.value === ''
                          ? undefined
                          : Math.round(Number(ev.target.value) * 12),
                      )
                    }
                  />
                )}
              />
            )}
          </FormField>
          <FormField label="Location" error={e.location?.message}>
            {(p) => <Input {...p} {...register('location')} />}
          </FormField>
          {!candidate && (
            <FormField label="Source" error={e.source?.message}>
              {(p) => (
                <NativeSelect {...p} {...register('source')}>
                  <option value="MANUAL">Manual entry</option>
                  <option value="REFERRAL">Referral</option>
                  <option value="IMPORT">Import</option>
                </NativeSelect>
              )}
            </FormField>
          )}
          <div className="sm:col-span-2">
            <SkillsEditor
              control={control}
              register={register}
              name="skills"
              mode="candidate"
              error={e.skills?.message}
            />
          </div>
          <FormField label="Summary" error={e.summary?.message} className="sm:col-span-2">
            {(p) => <Textarea {...p} {...register('summary')} />}
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="candidate-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {candidate ? 'Save changes' : 'Create candidate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
