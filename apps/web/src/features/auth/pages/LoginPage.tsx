import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { safeRedirect } from '@/lib/safe-redirect';
import { useAuth } from '../AuthProvider';
import { AuthLayout } from '../components/AuthLayout';

// Fictional demo accounts (seeded); shown only when VITE_DEMO_MODE=true.
const DEMO_ACCOUNTS = [
  ['Super Admin', 'admin@staffos.demo'],
  ['HR Manager', 'hr@staffos.demo'],
  ['Recruiter', 'recruiter@staffos.demo'],
  ['Account Manager', 'am@staffos.demo'],
  ['Hiring Manager', 'hm@staffos.demo'],
  ['Finance', 'finance@staffos.demo'],
  ['Employee', 'employee@staffos.demo'],
  ['Client user', 'client@staffos.demo'],
] as const;
const DEMO_PASSWORD = 'StaffOS-Demo-2026!';

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'INVALID_CREDENTIALS') return 'Email or password is incorrect.';
    if (error.code === 'ACCOUNT_LOCKED') {
      const seconds = Number(error.error.details.retryAfterSeconds) || 900;
      return `Too many failed attempts. Try again in ${Math.ceil(seconds / 60)} minutes or reset your password.`;
    }
    if (error.code === 'RATE_LIMITED')
      return 'Too many attempts from this network. Wait a minute and try again.';
  }
  return 'We could not sign you in. Please try again.';
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values);
      navigate(safeRedirect(params.get('next')), { replace: true });
    } catch (error) {
      setServerError(loginErrorMessage(error));
    }
  });

  return (
    <AuthLayout title="Sign in" description="Use your StaffOS work account.">
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {serverError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}
        <FormField label="Email" error={errors.email?.message}>
          {(p) => (
            <Input {...p} {...register('email')} type="email" autoComplete="username" autoFocus />
          )}
        </FormField>
        <FormField label="Password" error={errors.password?.message}>
          {(p) => (
            <Input
              {...p}
              {...register('password')}
              type="password"
              autoComplete="current-password"
            />
          )}
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
          Sign in
        </Button>
        <Link
          to="/forgot-password"
          className="justify-self-center text-sm text-primary underline-offset-4 hover:underline"
        >
          Forgot your password?
        </Link>
      </form>

      {import.meta.env.VITE_DEMO_MODE === 'true' && (
        <details className="mt-6 rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Demo accounts</summary>
          <p className="mt-2 text-muted-foreground">
            Fictional data. Pick a role to fill the form.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {DEMO_ACCOUNTS.map(([label, email]) => (
              <Button
                key={email}
                variant="outline"
                size="sm"
                onClick={() => {
                  setValue('email', email);
                  setValue('password', DEMO_PASSWORD);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </details>
      )}
    </AuthLayout>
  );
}
