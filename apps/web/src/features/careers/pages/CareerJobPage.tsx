import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplyResponse,
  applySchema,
  CONSENT_TEXT,
  EMIRATE_LABELS,
  formatFils,
  JOB_CATEGORY_LABELS,
  MAX_UPLOAD_BYTES,
} from '@staffos/shared';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { useApply, usePublicJob } from '../api';
import { Turnstile, TURNSTILE_SITE_KEY } from '../components/Turnstile';

type Values = z.input<typeof applySchema>;

export function CareerJobPage() {
  const { slug = '' } = useParams();
  const job = usePublicJob(slug);
  const [done, setDone] = useState<ApplyResponse | null>(null);

  if (job.error) {
    return (
      <>
        <BackLink />
        {job.error instanceof ApiClientError && job.error.status === 404 ? (
          <p className="text-muted-foreground">This job is no longer open.</p>
        ) : (
          <ErrorState error={job.error} onRetry={() => void job.refetch()} />
        )}
      </>
    );
  }
  if (!job.data) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const j = job.data;

  return (
    <>
      <BackLink />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{j.title}</h1>
      <p className="mt-1 text-muted-foreground">
        {j.location}, {EMIRATE_LABELS[j.emirate]} · {JOB_CATEGORY_LABELS[j.category]}
        {j.clientName && ` · ${j.clientName}`}
        {(j.salaryMinFils || j.salaryMaxFils) &&
          ` · ${formatFils(j.salaryMinFils ?? j.salaryMaxFils, j.currency)}${
            j.salaryMinFils && j.salaryMaxFils
              ? ` – ${formatFils(j.salaryMaxFils, j.currency)}`
              : ''
          } / month`}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section aria-labelledby="about" className="grid content-start gap-4">
          <h2 id="about" className="text-lg font-semibold">
            About the role
          </h2>
          <p className="whitespace-pre-line">
            {j.description ?? 'Details will be shared at interview.'}
          </p>
          {j.skills.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {j.skills.map((s) => (
                  <Badge key={s.name} variant={s.required ? 'default' : 'secondary'}>
                    {s.name}
                    {s.required ? '' : ' (nice to have)'}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </section>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{done ? 'Application sent' : 'Apply now'}</CardTitle>
          </CardHeader>
          <CardContent>
            {done ? <Confirmation result={done} /> : <ApplyForm slug={slug} onDone={setDone} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/careers"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All jobs
    </Link>
  );
}

function Confirmation({ result }: { result: ApplyResponse }) {
  const path = new URL(result.trackingUrl, window.location.origin).pathname;
  return (
    <div role="status" className="grid gap-3 text-sm">
      <CheckCircle2 className="size-8 text-success" aria-hidden />
      <p>{result.message}</p>
      <p>We have emailed you a private link to follow your application.</p>
      <Link to={path} className="font-medium text-primary underline-offset-4 hover:underline">
        Track my application
      </Link>
    </div>
  );
}

function ApplyForm({ slug, onDone }: { slug: string; onDone: (r: ApplyResponse) => void }) {
  const apply = useApply(slug);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(applySchema),
  });
  const e = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (!file) return setFileError('Attach your CV (PDF or Word).');
    if (file.size > MAX_UPLOAD_BYTES) return setFileError('Your CV can be at most 10 MB.');
    if (TURNSTILE_SITE_KEY && !token) return setServerError('Please complete the check below.');
    const form = new FormData();
    for (const [k, v] of Object.entries(values)) if (v !== undefined) form.append(k, String(v));
    if (token) form.append('turnstileToken', token);
    form.append('file', file);
    try {
      onDone(await apply.mutateAsync(form));
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [f, m] of Object.entries(error.fieldErrors))
          setError(f as keyof Values, { message: m[0] });
        setServerError(
          error.status === 429
            ? 'Too many applications from this network. Please try again later.'
            : error.message,
        );
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <FormField label="First name" error={e.firstName?.message}>
          {(p) => <Input {...p} autoComplete="given-name" {...register('firstName')} />}
        </FormField>
        <FormField label="Last name" error={e.lastName?.message}>
          {(p) => <Input {...p} autoComplete="family-name" {...register('lastName')} />}
        </FormField>
      </div>
      <FormField label="Email" error={e.email?.message}>
        {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
      </FormField>
      <FormField label="Mobile number" error={e.phone?.message}>
        {(p) => (
          <Input
            {...p}
            type="tel"
            autoComplete="tel"
            placeholder="+971 50 000 0000"
            {...register('phone')}
          />
        )}
      </FormField>
      <FormField label="CV (PDF or Word, max 10 MB)" error={fileError ?? undefined}>
        {(p) => (
          <Input
            {...p}
            type="file"
            accept=".pdf,.docx"
            onChange={(ev) => {
              setFileError(null);
              setFile(ev.target.files?.[0] ?? null);
            }}
          />
        )}
      </FormField>
      <FormField label="Cover note (optional)" error={e.coverNote?.message}>
        {(p) => <Textarea {...p} {...register('coverNote')} className="min-h-20" />}
      </FormField>
      <div className="grid gap-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            value="true"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            aria-invalid={e.consent ? true : undefined}
            {...register('consent')}
          />
          <span>{CONSENT_TEXT}</span>
        </label>
        {e.consent && <p className="text-xs text-destructive">{e.consent.message}</p>}
      </div>
      <Turnstile onToken={onToken} />
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        Send application
      </Button>
    </form>
  );
}
