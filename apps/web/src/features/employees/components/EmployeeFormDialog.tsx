import { zodResolver } from '@hookform/resolvers/zod';
import { EMPLOYEE_STATUS_LABELS, type Employee, employeeUpdateSchema } from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { Input, NativeSelect } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { useDepartments, usePositions, useUpdateEmployee } from '../api';

type Values = z.input<typeof employeeUpdateSchema>;

/** Empty inputs and the "None" option mean "clear it". */
const blankToNull = (v: unknown) => (v === '' ? null : v);

/**
 * HR edits the whole record; an employee editing their own profile (`contactOnly`) sees just
 * email and phone. The API enforces the same split.
 */
export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  contactOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
  contactOnly: boolean;
}) {
  const update = useUpdateEmployee();
  const departments = useDepartments(open && !contactOnly);
  const positions = usePositions(open && !contactOnly);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>({
    resolver: zodResolver(employeeUpdateSchema),
  });
  const e = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(
      contactOnly
        ? { version: employee.version, email: employee.email, phone: employee.phone }
        : {
            version: employee.version,
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
            phone: employee.phone,
            departmentId: employee.department?.id ?? null,
            positionId: employee.position?.id ?? null,
            status: employee.status,
            salaryFils: employee.salaryFils ?? undefined,
          },
    );
  }, [open, employee, contactOnly, reset]);

  const close = (next: boolean) => {
    if (!next) setServerError(null);
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    const input = contactOnly ? values : { ...values, salaryFils: values.salaryFils ?? null };
    try {
      await update.mutateAsync({ id: employee.id, input });
      toast.success(contactOnly ? 'Contact details saved.' : 'Employee updated.');
      close(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [f, m] of Object.entries(error.fieldErrors))
          setError(f as keyof Values, { message: m[0] });
        setServerError(
          error.code === 'STALE_VERSION'
            ? 'Someone else changed this record. Close and reopen to see the latest.'
            : error.message,
        );
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{contactOnly ? 'Edit my contact details' : 'Edit employee'}</DialogTitle>
          <DialogDescription>
            {contactOnly
              ? 'Other details are maintained by HR.'
              : `${employee.employeeNumber}. Changes are audited.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id="employee-form"
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
          {!contactOnly && (
            <>
              <FormField label="First name" error={e.firstName?.message}>
                {(p) => <Input {...p} {...register('firstName')} />}
              </FormField>
              <FormField label="Last name" error={e.lastName?.message}>
                {(p) => <Input {...p} {...register('lastName')} />}
              </FormField>
            </>
          )}
          <FormField label="Email" error={e.email?.message}>
            {(p) => <Input {...p} type="email" {...register('email')} />}
          </FormField>
          <FormField label="Phone" error={e.phone?.message}>
            {(p) => (
              <Input
                {...p}
                type="tel"
                placeholder="+971 50 000 0000"
                {...register('phone', { setValueAs: blankToNull })}
              />
            )}
          </FormField>
          {!contactOnly && (
            <>
              <FormField label="Department" error={e.departmentId?.message}>
                {(p) => (
                  <NativeSelect {...p} {...register('departmentId', { setValueAs: blankToNull })}>
                    <option value="">None</option>
                    {departments.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField label="Position" error={e.positionId?.message}>
                {(p) => (
                  <NativeSelect {...p} {...register('positionId', { setValueAs: blankToNull })}>
                    <option value="">None</option>
                    {positions.data?.map((pos) => (
                      <option key={pos.id} value={pos.id}>
                        {pos.title}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField
                label="Status"
                error={e.status?.message}
                hint="Terminating cancels open onboarding and closes their login."
              >
                {(p) => (
                  <NativeSelect {...p} {...register('status')}>
                    {Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
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
            </>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
