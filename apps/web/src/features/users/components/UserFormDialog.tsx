import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, ROLE_LABELS, type RoleCode, type User } from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { useCreateUser, useUpdateUser } from '../api';

// Client users are invited from the client's page (CRM), where the company is known.
const INTERNAL_ROLES = (Object.keys(ROLE_LABELS) as RoleCode[]).filter((r) => r !== 'CLIENT_USER');

type FormValues = z.input<typeof createUserSchema>;

/** Create (invite) a user, or edit name/roles of an existing one. */
export function UserFormDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User;
}) {
  const create = useCreateUser();
  const update = useUpdateUser();
  const [serverError, setServerError] = useState<string | null>(null);
  const editing = Boolean(user);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', firstName: '', lastName: '', roles: [] },
  });

  useEffect(() => {
    if (open) {
      reset(
        user
          ? {
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              roles: user.roles,
            }
          : { email: '', firstName: '', lastName: '', roles: [] },
      );
    }
  }, [open, user, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (user) {
        await update.mutateAsync({
          id: user.id,
          input: { firstName: values.firstName, lastName: values.lastName, roles: values.roles },
        });
        toast.success('User updated.');
      } else {
        await create.mutateAsync(createUserSchema.parse(values));
        toast.success(`Invitation sent to ${values.email}.`);
      }
      setServerError(null);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'USER_EMAIL_EXISTS')
          return setError('email', { message: error.message });
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          setError(field as keyof FormValues, { message: messages[0] });
        }
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit user' : 'Invite user'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changing roles signs the user out of their current sessions.'
              : 'They receive an email to set their password. The link expires in 72 hours.'}
          </DialogDescription>
        </DialogHeader>
        <form id="user-form" onSubmit={onSubmit} noValidate className="grid gap-4">
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
              <Input
                {...p}
                {...register('email')}
                type="email"
                disabled={editing}
                autoComplete="off"
              />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" error={errors.firstName?.message}>
              {(p) => <Input {...p} {...register('firstName')} autoComplete="off" />}
            </FormField>
            <FormField label="Last name" error={errors.lastName?.message}>
              {(p) => <Input {...p} {...register('lastName')} autoComplete="off" />}
            </FormField>
          </div>
          <Controller
            control={control}
            name="roles"
            render={({ field }) => (
              <fieldset
                className="grid gap-2"
                aria-describedby={errors.roles ? 'roles-error' : undefined}
              >
                <legend className="mb-1 text-sm font-medium">Roles</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {INTERNAL_ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={field.value.includes(role)}
                        onChange={(e) =>
                          field.onChange(
                            e.target.checked
                              ? [...field.value, role]
                              : field.value.filter((r) => r !== role),
                          )
                        }
                      />
                      {ROLE_LABELS[role]}
                    </label>
                  ))}
                </div>
                {errors.roles && (
                  <p id="roles-error" className="text-xs text-destructive">
                    {errors.roles.message}
                  </p>
                )}
              </fieldset>
            )}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {editing ? 'Save changes' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
