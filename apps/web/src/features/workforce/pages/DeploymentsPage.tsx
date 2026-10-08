import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Deployment,
  DEPLOYMENT_STATUS_LABELS,
  deploymentCreateSchema,
  type DeploymentStatus,
  formatFils,
} from '@staffos/shared';
import { Loader2, Plus } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { FormField } from '@/components/form-field';
import { MoneyInput } from '@/components/money-input';
import { PageHeader } from '@/components/states';
import { Badge, type BadgeProps } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/AuthProvider';
import { useClients, useProjects } from '@/features/clients/api';
import { useEmployees } from '@/features/employees/api';
import { ApiClientError } from '@/lib/api-client';
import { useListParams } from '@/lib/list-params';
import { useCreateDeployment, useDeployments, useEndDeployment } from '../api';

const VARIANT: Record<DeploymentStatus, BadgeProps['variant']> = {
  PLANNED: 'secondary',
  ACTIVE: 'success',
  ENDED: 'secondary',
  CANCELLED: 'destructive',
};

export function DeploymentsPage() {
  const { can } = useAuth();
  const { get, update } = useListParams();
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<Deployment | null>(null);
  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? '-startDate',
    filter: { status: get('status') as DeploymentStatus | undefined },
  };
  const deployments = useDeployments(query);
  const canWrite = can('deployments:write');

  const columns = useMemo<DataTableColumn<Deployment>[]>(
    () => [
      {
        id: 'employee',
        header: 'Employee',
        enableHiding: false,
        meta: { label: 'Employee' },
        cell: ({ row }) => (
          <div className="min-w-36">
            {can('employees:read') ? (
              <Link
                to={`/employees/${row.original.employee.id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {row.original.employee.name}
              </Link>
            ) : (
              <span className="font-medium">{row.original.employee.name}</span>
            )}
            <div className="text-xs text-muted-foreground">
              {row.original.employee.employeeNumber}
            </div>
          </div>
        ),
      },
      {
        id: 'project',
        header: 'Client · project',
        meta: { label: 'Client and project' },
        cell: ({ row }) => (
          <div>
            {row.original.client.name}
            <div className="text-xs text-muted-foreground">{row.original.project.name}</div>
          </div>
        ),
      },
      {
        id: 'startDate',
        header: 'Dates',
        meta: { sortKey: 'startDate', label: 'Dates' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.startDate} → {row.original.endDate ?? 'open'}
          </span>
        ),
      },
      {
        id: 'rate',
        header: 'Bill rate',
        meta: { label: 'Bill rate' },
        cell: ({ row }) =>
          row.original.billRateFils === null ? (
            '—'
          ) : (
            <span className="tabular-nums">
              {formatFils(row.original.billRateFils, row.original.currency)}/h
            </span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Badge variant={VARIANT[row.original.status]}>
              {DEPLOYMENT_STATUS_LABELS[row.original.status]}
            </Badge>
            {canWrite &&
              (row.original.status === 'ACTIVE' || row.original.status === 'PLANNED') && (
                <Button variant="ghost" size="sm" onClick={() => setEnding(row.original)}>
                  End
                </Button>
              )}
          </span>
        ),
      },
    ],
    [can, canWrite],
  );

  return (
    <>
      <PageHeader
        title="Deployments"
        description="Who is working on which client project, from when, and at what rate."
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Deploy someone
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={deployments.data?.data}
        meta={deployments.data?.meta}
        isLoading={deployments.isPending}
        error={deployments.error}
        onRetry={() => void deployments.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No deployments"
        emptyDescription="Deploy an onboarded employee to a client project."
        toolbar={
          <NativeSelect
            aria-label="Filter by status"
            className="sm:w-40"
            value={query.filter.status ?? ''}
            onChange={(e) => update({ status: e.target.value || undefined })}
          >
            <option value="">All statuses</option>
            {Object.entries(DEPLOYMENT_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {creating && <NewDeploymentDialog onClose={() => setCreating(false)} />}
      {ending && <EndDeploymentDialog deployment={ending} onClose={() => setEnding(null)} />}
    </>
  );
}

type Values = z.input<typeof deploymentCreateSchema>;

/** US-DEP-01. Mounted only while open. */
function NewDeploymentDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const isHr = user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'HR_MANAGER') ?? false;
  const create = useCreateDeployment();
  const [clientId, setClientId] = useState('');
  const clients = useClients({ pageSize: 100, sort: 'name' });
  const projects = useProjects(clientId, Boolean(clientId));
  const employees = useEmployees({ pageSize: 100, sort: 'lastName' });
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);
  const { register, control, handleSubmit, setValue, setError, formState } = useForm<Values>({
    resolver: zodResolver(deploymentCreateSchema),
    defaultValues: { currency: 'AED', startDate: new Date().toISOString().slice(0, 10) },
  });
  const e = formState.errors;
  const employeeId = useWatch({ control, name: 'employeeId' });
  const selected = employees.data?.data.find((x) => x.id === employeeId);

  useEffect(() => setValue('projectId', ''), [clientId, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      toast.success('Deployment created.');
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'ONBOARDING_INCOMPLETE') setNeedsOverride(true);
        for (const [f, m] of Object.entries(error.fieldErrors))
          setError(f as keyof Values, { message: m[0] });
        setServerError(error.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Deploy someone</DialogTitle>
          <DialogDescription>
            The bill rate is per hour and is invoiced from approved timesheets.
          </DialogDescription>
        </DialogHeader>
        <form
          id="deployment-form"
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
          <FormField label="Employee" error={e.employeeId?.message} className="sm:col-span-2">
            {(p) => (
              <NativeSelect {...p} {...register('employeeId')} disabled={employees.isPending}>
                <option value="">{employees.isPending ? 'Loading…' : 'Select'}</option>
                {employees.data?.data
                  .filter((x) => x.status !== 'TERMINATED')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.firstName} {x.lastName} · {x.employeeNumber}
                      {x.status === 'ONBOARDING' ? ' (onboarding)' : ''}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </FormField>
          <div className="grid gap-1.5">
            <Label htmlFor="deploy-client">Client</Label>
            <NativeSelect
              id="deploy-client"
              value={clientId}
              onChange={(ev) => setClientId(ev.target.value)}
            >
              <option value="">Select</option>
              {clients.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <FormField label="Project" error={e.projectId?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('projectId')} disabled={!clientId}>
                <option value="">{clientId ? 'Select' : 'Choose a client first'}</option>
                {projects.data
                  ?.filter((pr) => pr.status === 'ACTIVE')
                  .map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Start date" error={e.startDate?.message}>
            {(p) => <Input {...p} type="date" {...register('startDate')} />}
          </FormField>
          <FormField label="End date (optional)" error={e.endDate?.message}>
            {(p) => (
              <Input
                {...p}
                type="date"
                {...register('endDate', { setValueAs: (v) => v || undefined })}
              />
            )}
          </FormField>
          <FormField label="Bill rate (AED per hour)" error={e.billRateFils?.message}>
            {(p) => (
              <Controller
                control={control}
                name="billRateFils"
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
          {isHr && (needsOverride || selected?.status === 'ONBOARDING') && (
            <FormField
              label="Reason to deploy before onboarding is complete"
              error={e.overrideReason?.message}
              className="sm:col-span-2"
              hint="HR Managers only. Recorded on the deployment and in the audit log."
            >
              {(p) => <Textarea {...p} {...register('overrideReason')} />}
            </FormField>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="deployment-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Deploy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EndDeploymentDialog({
  deployment,
  onClose,
}: {
  deployment: Deployment;
  onClose: () => void;
}) {
  const id = useId();
  const end = useEndDeployment();
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!reason.trim()) return setError('Give a reason.');
    try {
      const updated = await end.mutateAsync({
        id: deployment.id,
        input: { version: deployment.version, endDate, reason },
      });
      toast.success(updated.status === 'CANCELLED' ? 'Deployment cancelled.' : 'End date set.');
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>End deployment: {deployment.employee.name}</DialogTitle>
          <DialogDescription>
            A date before the start cancels a planned deployment. Approved hours stay invoiceable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-date`}>Last working day</Label>
            <Input
              id={`${id}-date`}
              type="date"
              value={endDate}
              onChange={(ev) => setEndDate(ev.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-reason`}>Reason</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              maxLength={500}
              onChange={(ev) => setReason(ev.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={end.isPending}>
            {end.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
