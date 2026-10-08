import { ROLE_LABELS } from '@staffos/shared';
import { Link } from 'react-router';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { HealthStatusCard } from '@/features/health/components/HealthStatusCard';
import { canSeeNavItem, NAV } from '../layout/nav';

/** Role dashboards arrive with the reports module; for now: who you are and where to go. */
export function DashboardPage() {
  const { user, can } = useAuth();
  if (!user) return null;
  const shortcuts = NAV.flatMap((s) => s.items).filter(
    (i) => i.to !== '/' && canSeeNavItem(i, (p) => can(p)),
  );

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Here is what you can do in StaffOS today."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your access</CardTitle>
            <CardDescription>
              Roles decide what you can see and do. Data is limited to what your role covers.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-1.5">
              {user.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABELS[role]}
                </Badge>
              ))}
            </div>
            {shortcuts.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {shortcuts.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Icon className="size-4 text-primary" aria-hidden />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your workspace for this role is coming in the next releases.
              </p>
            )}
          </CardContent>
        </Card>
        <HealthStatusCard />
      </div>
    </>
  );
}
