import { formatFils, formatMinutes } from '@staffos/shared';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoices } from '../invoices/api';
import { useRequests } from '../manpower-requests/api';
import { REQUEST_STATUS_LABELS } from '../manpower-requests/components/status';
import { useTimesheets } from '../workforce/api';

type Q = { error: unknown; isPending: boolean; refetch: () => unknown };
function Section({
  title,
  q,
  empty,
  all,
  children,
}: {
  title: string;
  q: Q;
  empty: boolean;
  all: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <Link to={all} className="text-sm text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : empty ? (
          <EmptyState title="Nothing here yet" />
        ) : (
          <ul className="divide-y text-sm">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Client portal home (PRD module 13): the company's requests, timesheets waiting for its
 * approval and invoices. Every list is already limited to the user's own company by the API.
 */
export function ClientPortalHome() {
  const requests = useRequests({ page: 1, pageSize: 5, sort: '-createdAt' });
  const timesheets = useTimesheets({ page: 1, pageSize: 5, filter: { status: 'SUBMITTED' } });
  const invoices = useInvoices({ page: 1, pageSize: 5, sort: '-createdAt' });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/requests">
            <Plus aria-hidden />
            Request staff
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Section
          title="Timesheets to approve"
          q={timesheets}
          empty={!timesheets.data?.data.length}
          all="/timesheets?status=SUBMITTED"
        >
          {timesheets.data?.data.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <Link
                to={`/timesheets/${t.id}`}
                className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
              >
                {t.employee.name}
              </Link>
              <span className="text-muted-foreground">Week of {t.weekStart}</span>
              <span className="tabular-nums">{formatMinutes(t.totalMinutes)}</span>
            </li>
          ))}
        </Section>
        <Section
          title="Your requests"
          q={requests}
          empty={!requests.data?.data.length}
          all="/requests"
        >
          {requests.data?.data.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <Link
                to={`/requests/${r.id}`}
                className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
              >
                {r.roleTitle} ×{r.headcount}
              </Link>
              <Badge variant="secondary">{REQUEST_STATUS_LABELS[r.status]}</Badge>
            </li>
          ))}
        </Section>
        <Section title="Invoices" q={invoices} empty={!invoices.data?.data.length} all="/invoices">
          {invoices.data?.data.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2">
              <Link
                to={`/invoices/${i.id}`}
                className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
              >
                {i.number ?? 'Draft'}
              </Link>
              <Badge variant={i.status === 'PAID' ? 'success' : 'secondary'}>
                {i.status.toLowerCase()}
              </Badge>
              <span className="tabular-nums">{formatFils(i.totalFils)}</span>
            </li>
          ))}
        </Section>
      </div>
    </div>
  );
}
