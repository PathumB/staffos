import { formatFils } from '@staffos/shared';
import { ArrowLeft, Mail, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePlan } from '@/features/onboarding/api';
import { OnboardingChecklist } from '@/features/onboarding/components/OnboardingChecklist';
import { ApiClientError } from '@/lib/api-client';
import { useEmployee, useInviteEmployee } from '../api';
import { EmployeeStatusBadge } from '../components/badges';
import { EmployeeFormDialog } from '../components/EmployeeFormDialog';

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const { user, can } = useAuth();
  const employee = useEmployee(id);
  const planId = employee.data?.onboarding?.planId ?? '';
  const plan = usePlan(planId, Boolean(planId) && can('onboarding:read'));
  const invite = useInviteEmployee();
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);

  if (employee.error) {
    return <ErrorState error={employee.error} onRetry={() => void employee.refetch()} />;
  }
  if (!employee.data) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const e = employee.data;
  const isHr = user?.roles.some((r) => r === 'SUPER_ADMIN' || r === 'HR_MANAGER') ?? false;
  const isSelf = user?.employeeId === e.id;
  const editable = e.status !== 'TERMINATED' && can('employees:write') && (isHr || isSelf);

  return (
    <>
      {!isSelf || isHr ? (
        <Link
          to="/employees"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All employees
        </Link>
      ) : null}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {e.firstName} {e.lastName}
            <EmployeeStatusBadge status={e.status} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {e.employeeNumber}
            {e.position && ` · ${e.position.title}`}
            {e.department && ` · ${e.department.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isHr && !e.account && e.status !== 'TERMINATED' && (
            <Button variant="outline" onClick={() => setInviting(true)}>
              <Mail aria-hidden />
              Invite to StaffOS
            </Button>
          )}
          {editable && (
            <Button onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {isHr ? 'Edit' : 'Edit contact details'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Onboarding</CardTitle>
          </CardHeader>
          <CardContent>
            {!e.onboarding ? (
              <p className="text-sm text-muted-foreground">No onboarding plan.</p>
            ) : !can('onboarding:read') ? (
              <p className="text-sm text-muted-foreground">
                {e.onboarding.done} of {e.onboarding.total} tasks done.
              </p>
            ) : plan.error ? (
              <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
            ) : !plan.data ? (
              <div role="status" className="h-40 animate-pulse rounded-md bg-muted">
                <span className="sr-only">Loading checklist…</span>
              </div>
            ) : (
              <OnboardingChecklist plan={plan.data} />
            )}
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <Detail label="Email">{e.email}</Detail>
              <Detail label="Phone">{e.phone ?? '—'}</Detail>
              <Detail label="Start date">{e.hireDate}</Detail>
              {e.salaryFils !== null && (
                <Detail label="Salary (per month)">{formatFils(e.salaryFils, e.currency)}</Detail>
              )}
              <Detail label="Hired for">
                {e.job ? (
                  e.applicationId && can('applications:read') ? (
                    <Link
                      to={`/applications/${e.applicationId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {e.job.title} · {e.job.client}
                    </Link>
                  ) : (
                    `${e.job.title} · ${e.job.client}`
                  )
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="StaffOS login">
                {e.account
                  ? e.account.status === 'INVITED'
                    ? 'Invited, not yet activated'
                    : e.account.status === 'ACTIVE'
                      ? 'Active'
                      : 'Deactivated'
                  : 'None'}
              </Detail>
            </dl>
          </CardContent>
        </Card>
      </div>

      <EmployeeFormDialog
        open={editing}
        onOpenChange={setEditing}
        employee={e}
        contactOnly={!isHr}
      />
      <ActionDialog
        open={inviting}
        onOpenChange={setInviting}
        title={`Invite ${e.firstName} to StaffOS?`}
        description={`They'll get an email at ${e.email} to set a password, then can see their profile and complete their onboarding tasks.`}
        confirmLabel="Send invitation"
        onConfirm={async () => {
          try {
            await invite.mutateAsync(e.id);
            toast.success('Invitation sent.');
          } catch (error) {
            toast.error(error instanceof ApiClientError ? error.message : 'Could not invite.');
          }
        }}
      />
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
