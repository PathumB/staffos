import { ROLE_LABELS } from '@staffos/shared';
import { Link } from 'react-router';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { HealthStatusCard } from '@/features/health/components/HealthStatusCard';
import { useDashboard } from '@/features/reports/api';
import { FunnelChart, RevenueChart, WidgetCard } from '@/features/reports/components/charts';
import { ClientPortalHome } from '@/features/portal/ClientPortalHome';
import { canSeeNavItem, NAV } from '../layout/nav';

/** US-DASH-01: widgets for my roles (numbers respect my data scope), plus shortcuts. */
export function DashboardPage() {
  const { user, can } = useAuth();
  const canReport = can('reports:read');
  const dashboard = useDashboard(Boolean(user) && canReport);
  if (!user) return null;
  const shortcuts = NAV.flatMap((s) => s.items).filter(
    (i) => i.to !== '/' && canSeeNavItem(i, (p) => can(p)),
  );
  const d = dashboard.data;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Your numbers for today. Figures only include the clients and jobs you work on."
      />
      {/* Client users get the portal home: their company's requests, timesheets and invoices. */}
      {user.clientId && (
        <div className="mb-6">
          <ClientPortalHome />
        </div>
      )}
      {canReport &&
        (dashboard.error ? (
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        ) : dashboard.isPending ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          d && (
            <div className="mb-6 grid gap-4">
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {d.widgets.map((w) => (
                  <li key={w.key}>
                    <WidgetCard widget={w} />
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 lg:grid-cols-2">
                {d.funnel && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Hiring funnel</CardTitle>
                      <CardDescription>Applications in the last 90 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {d.funnel.stages[0]!.count === 0 ? (
                        <EmptyState title="No applications yet" />
                      ) : (
                        <FunnelChart funnel={d.funnel} />
                      )}
                    </CardContent>
                  </Card>
                )}
                {d.revenueByMonth && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Invoiced per month</CardTitle>
                      <CardDescription>Issued and paid invoices, last 12 months</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {d.revenueByMonth.length === 0 ? (
                        <EmptyState title="No invoices yet" />
                      ) : (
                        <RevenueChart months={d.revenueByMonth} />
                      )}
                    </CardContent>
                  </Card>
                )}
                {d.openRequests && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Oldest open requests</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {d.openRequests.length === 0 ? (
                        <EmptyState title="No open requests" />
                      ) : (
                        <ul className="divide-y text-sm">
                          {d.openRequests.map((r) => (
                            <li key={r.manpowerRequestId} className="flex items-center gap-2 py-2">
                              <Link
                                to={`/requests/${r.manpowerRequestId}`}
                                className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
                              >
                                {r.roleTitle} ×{r.headcount}
                              </Link>
                              <span className="truncate text-muted-foreground">{r.clientName}</span>
                              <Badge variant={r.ageDays > 30 ? 'warning' : 'secondary'}>
                                {r.ageDays} d
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )
        ))}
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
            {shortcuts.length > 0 && (
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
            )}
          </CardContent>
        </Card>
        <HealthStatusCard />
      </div>
    </>
  );
}
