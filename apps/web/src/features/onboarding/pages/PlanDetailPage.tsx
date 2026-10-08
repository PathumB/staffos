import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ErrorState } from '@/components/states';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePlan } from '../api';
import { OnboardingChecklist } from '../components/OnboardingChecklist';

export function PlanDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const plan = usePlan(id);

  if (plan.error) return <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />;
  if (!plan.data) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const p = plan.data;

  return (
    <>
      <Link
        to="/onboarding"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All onboarding
      </Link>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Onboarding: {p.employee.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {p.employee.employeeNumber} · starts {p.startDate}
          {p.template && ` · ${p.template.name}`}
          {can('employees:read') && (
            <>
              {' · '}
              <Link
                to={`/employees/${p.employee.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                Employee record
              </Link>
            </>
          )}
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <OnboardingChecklist plan={p} />
        </CardContent>
      </Card>
    </>
  );
}
