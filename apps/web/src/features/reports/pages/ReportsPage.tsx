import {
  AI_SUGGESTION_LABEL,
  formatFils,
  JOB_CATEGORY_LABELS,
  type JobCategory,
  REPORT_LABELS,
  REPORT_NAMES,
  type ReportFilter,
  type ReportName,
} from '@staffos/shared';
import { Download, Loader2, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/AuthProvider';
import { ClientPicker } from '@/features/clients/components/ClientPicker';
import { ApiClientError, apiDownload } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';
import { useListParams } from '@/lib/list-params';
import {
  useAskData,
  useClientRevenue,
  useHiringFunnel,
  useOpenRequests,
  useTimeToHire,
} from '../api';
import { FunnelChart, ResultChart, RevenueChart } from '../components/charts';

function SimpleTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((v, j) => (
                <TableCell key={j} className={typeof v === 'number' ? 'tabular-nums' : undefined}>
                  {v}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** US-REP-01: the four reports with shared filters, CSV/Excel/PDF export, and Ask your data. */
export function ReportsPage() {
  const { can } = useAuth();
  const { get, update } = useListParams();
  const tab = (REPORT_NAMES as readonly string[]).includes(get('report') ?? '')
    ? (get('report') as ReportName)
    : 'hiring-funnel';
  const filter: ReportFilter = {
    from: get('from') || undefined,
    to: get('to') || undefined,
    clientId: get('clientId') || undefined,
  };
  const fromId = useId();
  const toId = useId();
  const [exporting, setExporting] = useState<string | null>(null);

  const download = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      await apiDownload(
        `/reports/${tab}/export?${toQueryString({ ...filter, format })}`,
        `staffos-${tab}.${format}`,
      );
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Figures respect your data scope. Exports use the same filters as the screen."
      />
      {can('ai:ask-data') && <AskData />}

      <div role="tablist" aria-label="Reports" className="mb-4 flex flex-wrap gap-1 border-b">
        {REPORT_NAMES.map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            aria-selected={tab === name}
            onClick={() => update({ report: name })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              tab === name
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {REPORT_LABELS[name]}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {tab !== 'open-requests' && (
          <>
            <div className="grid gap-1">
              <Label htmlFor={fromId}>From</Label>
              <Input
                id={fromId}
                type="date"
                value={filter.from ?? ''}
                onChange={(e) => update({ from: e.target.value || undefined })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={toId}>To</Label>
              <Input
                id={toId}
                type="date"
                value={filter.to ?? ''}
                onChange={(e) => update({ to: e.target.value || undefined })}
              />
            </div>
          </>
        )}
        <div className="grid min-w-56 gap-1">
          <ClientPicker
            label="Client"
            value={filter.clientId ?? ''}
            onChange={(id) => update({ clientId: id || undefined })}
          />
        </div>
        {can('reports:export') && (
          <div className="ml-auto flex gap-2">
            {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
              <Button
                key={f}
                variant="outline"
                size="sm"
                disabled={exporting !== null}
                onClick={() => void download(f)}
              >
                {exporting === f ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Download aria-hidden />
                )}
                {f === 'xlsx' ? 'Excel' : f.toUpperCase()}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {tab === 'hiring-funnel' && <FunnelReport filter={filter} />}
          {tab === 'time-to-hire' && <TimeToHireReport filter={filter} />}
          {tab === 'client-revenue' && <RevenueReport filter={filter} />}
          {tab === 'open-requests' && <OpenRequestsReport filter={filter} />}
        </CardContent>
      </Card>
    </>
  );
}

function State({
  q,
  children,
}: {
  q: { error: unknown; isPending: boolean; refetch: () => unknown };
  children: React.ReactNode;
}) {
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <>{children}</>;
}

function FunnelReport({ filter }: { filter: ReportFilter }) {
  const q = useHiringFunnel(filter);
  return (
    <State q={q}>
      {q.data &&
        (q.data.stages[0]!.count === 0 ? (
          <EmptyState title="No applications in this period" />
        ) : (
          <FunnelChart funnel={q.data} />
        ))}
    </State>
  );
}

function TimeToHireReport({ filter }: { filter: ReportFilter }) {
  const q = useTimeToHire(filter);
  const d = q.data;
  return (
    <State q={q}>
      {d &&
        (d.hires === 0 ? (
          <EmptyState title="No hires in this period" />
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <span>
                Hires: <strong className="tabular-nums">{d.hires}</strong>
              </span>
              <span>
                Average: <strong className="tabular-nums">{d.averageDays} days</strong>
              </span>
              <span>
                Median: <strong className="tabular-nums">{d.medianDays} days</strong>
              </span>
            </div>
            <SimpleTable
              columns={['Category', 'Hires', 'Average days']}
              rows={d.byCategory.map((c) => [
                JOB_CATEGORY_LABELS[c.category as JobCategory] ?? c.category,
                c.hires,
                c.averageDays,
              ])}
            />
            <SimpleTable
              columns={['Month', 'Hires', 'Average days']}
              rows={d.byMonth.map((m) => [m.month, m.hires, m.averageDays])}
            />
          </div>
        ))}
    </State>
  );
}

function RevenueReport({ filter }: { filter: ReportFilter }) {
  const q = useClientRevenue(filter);
  const d = q.data;
  return (
    <State q={q}>
      {d &&
        (d.byClient.length === 0 ? (
          <EmptyState title="No invoices in this period" />
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <span>
                Invoiced: <strong className="tabular-nums">{formatFils(d.totalFils)}</strong>
              </span>
              <span>
                Paid: <strong className="tabular-nums">{formatFils(d.paidFils)}</strong>
              </span>
              <span>
                Outstanding:{' '}
                <strong className="tabular-nums">{formatFils(d.outstandingFils)}</strong>
              </span>
            </div>
            {d.byMonth.length > 1 && <RevenueChart months={d.byMonth} />}
            <SimpleTable
              columns={['Client', 'Invoices', 'Invoiced', 'Paid', 'Outstanding']}
              rows={d.byClient.map((c) => [
                c.clientName,
                c.invoices,
                formatFils(c.totalFils),
                formatFils(c.paidFils),
                formatFils(c.outstandingFils),
              ])}
            />
          </div>
        ))}
    </State>
  );
}

function OpenRequestsReport({ filter }: { filter: ReportFilter }) {
  const q = useOpenRequests(filter);
  const d = q.data;
  return (
    <State q={q}>
      {d &&
        (d.total === 0 ? (
          <EmptyState title="No open requests" />
        ) : (
          <div className="grid gap-3">
            <p className="text-sm">
              {d.total} open, <strong>{d.olderThan30Days}</strong> older than 30 days.
            </p>
            <SimpleTable
              columns={['Client', 'Role', 'Headcount', 'Hired', 'Status', 'Age (days)']}
              rows={d.rows.map((r) => [
                r.clientName,
                r.roleTitle,
                r.headcount,
                r.hired,
                r.status.toLowerCase().replace('_', ' '),
                r.ageDays,
              ])}
            />
          </div>
        ))}
    </State>
  );
}

/** US-AI-02: the answer, the SQL that produced it, a table and a chart. */
function AskData() {
  const ask = useAskData();
  const id = useId();
  const [question, setQuestion] = useState('Which clients have open requests older than 30 days?');
  const res = ask.data;
  const error = ask.error instanceof ApiClientError ? ask.error : null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Ask your data
        </CardTitle>
        <CardDescription>
          Answers come from the reporting views only, with a read-only query you can check below.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim().length >= 5) ask.mutate(question.trim());
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor={id}>Question</Label>
            <Textarea
              id={id}
              rows={2}
              maxLength={500}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={ask.isPending || question.trim().length < 5}>
            {ask.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Ask
          </Button>
        </form>
        {ask.error && (
          <div
            role="alert"
            className="grid gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <span>{error?.message ?? 'Something went wrong. Please try again.'}</span>
            {typeof error?.error.details.sql === 'string' && (
              <code className="text-xs break-all text-foreground/80">
                {String(error.error.details.sql)}
              </code>
            )}
          </div>
        )}
        {res && (
          <div className="grid gap-3">
            <Badge variant="secondary" className="justify-self-start">
              {AI_SUGGESTION_LABEL}
            </Badge>
            <p className="text-sm">{res.answer}</p>
            {res.chart.type !== 'none' && res.chart.x && res.chart.y && res.rows.length > 1 && (
              <ResultChart type={res.chart.type} rows={res.rows} x={res.chart.x} y={res.chart.y} />
            )}
            {res.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">The query returned no rows.</p>
            ) : (
              <SimpleTable
                columns={res.columns}
                rows={res.rows.map((r) =>
                  res.columns.map((c) =>
                    typeof r[c] === 'number' ? (r[c] as number) : String(r[c] ?? ''),
                  ),
                )}
              />
            )}
            {res.truncated && (
              <p className="text-xs text-muted-foreground">Showing the first 500 rows.</p>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">SQL used</summary>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2">
                {res.sql}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
