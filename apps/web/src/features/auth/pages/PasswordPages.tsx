import { zodResolver } from '@hookform/resolvers/zod';
import { passwordResetRequestSchema, passwordSchema } from '@staffos/shared';
import { CircleCheck, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { AuthLayout } from '../components/AuthLayout';

function Success({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="grid gap-4 text-sm">
      <p className="flex gap-2">
        <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
        <span>{children}</span>
      </p>
      <Link to="/login" className={buttonVariants()}>
        Go to sign in
      </Link>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<z.input<typeof passwordResetRequestSchema>>(
    {
      resolver: zodResolver(passwordResetRequestSchema),
      defaultValues: { email: '' },
    },
  );

  const onSubmit = handleSubmit(async (values) => {
    // The API answers the same way whether or not the account exists.
    await apiFetch('/auth/password-reset/request', null, {
      method: 'POST',
      body: values,
      auth: false,
    }).catch(() => undefined);
    setSent(true);
  });

  return (
    <AuthLayout
      title="Reset your password"
      description="We will email you a link to choose a new password."
    >
      {sent ? (
        <Success>
          If an account exists for that email, a reset link is on its way. It expires in 30 minutes.
        </Success>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormField label="Email" error={formState.errors.email?.message}>
            {(p) => (
              <Input {...p} {...register('email')} type="email" autoComplete="email" autoFocus />
            )}
          </FormField>
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Send reset link
          </Button>
          <Link
            to="/login"
            className="justify-self-center text-sm text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}

const newPasswordForm = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  });

/** Shared by reset-password and accept-invitation: both set a password using a link token. */
function SetPasswordPage({ mode }: { mode: 'reset' | 'invite' }) {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<z.input<typeof newPasswordForm>>({
    resolver: zodResolver(newPasswordForm),
    defaultValues: { password: '', confirm: '' },
  });
  const title = mode === 'reset' ? 'Choose a new password' : 'Activate your account';

  const onSubmit = handleSubmit(async ({ password }) => {
    setServerError(null);
    const [path, body] =
      mode === 'reset'
        ? ['/auth/password-reset/confirm', { token, newPassword: password }]
        : ['/auth/invitations/accept', { token, password }];
    try {
      await apiFetch(path, null, { method: 'POST', body, auth: false });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'VALIDATION_FAILED') {
        const message = (error.fieldErrors.newPassword ?? error.fieldErrors.password)?.[0];
        if (message) return setError('password', { message });
      }
      setServerError(
        error instanceof ApiClientError && error.code === 'TOKEN_INVALID'
          ? 'This link is invalid or has expired. Ask for a new one.'
          : 'Something went wrong. Please try again.',
      );
    }
  });

  if (!token) {
    return (
      <AuthLayout title={title}>
        <p role="alert" className="text-sm">
          This link is incomplete. Open the link from your email again.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={title}
      description="Use at least 12 characters. A short phrase of unrelated words works well."
    >
      {done ? (
        <Success>
          {mode === 'reset'
            ? 'Your password was changed. Other sessions were signed out.'
            : 'Your account is active.'}
        </Success>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </p>
          )}
          <FormField label="New password" error={formState.errors.password?.message}>
            {(p) => (
              <Input
                {...p}
                {...register('password')}
                type="password"
                autoComplete="new-password"
                autoFocus
              />
            )}
          </FormField>
          <FormField label="Confirm password" error={formState.errors.confirm?.message}>
            {(p) => (
              <Input {...p} {...register('confirm')} type="password" autoComplete="new-password" />
            )}
          </FormField>
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {mode === 'reset' ? 'Change password' : 'Activate account'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export const ResetPasswordPage = () => <SetPasswordPage mode="reset" />;
export const AcceptInvitePage = () => <SetPasswordPage mode="invite" />;
