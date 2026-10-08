import { AI_FEATURE_LABELS, type AiRequest } from '@staffos/shared';
import { useMemo } from 'react';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { useListParams } from '@/lib/list-params';
import { useAiRequests, useAiUsage } from '../api';

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

/** US-AI-03: every AI call and the month-to-date cost against the budget. */
export function AiUsagePage() {
  const { get, update } = useListParams();
  const page = Number(get('page') ?? 1);
  const usage = useAiUsage();
  const requests = useAiRequests(page);

  const columns = useMemo<DataTableColumn<AiRequest>[]>(
    () => [
      {
        id: 'when',
        header: 'When',
        enableHiding: false,
        meta: { label: 'When' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        id: 'feature',
        header: 'Feature',
        meta: { label: 'Feature' },
        cell: ({ row }) => AI_FEATURE_LABELS[row.original.feature],
      },
      {
        id: 'model',
        header: 'Model',
        meta: { label: 'Model' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.provider} · {row.original.model}
          </span>
        ),
      },
      {
        id: 'prompt',
        header: 'Prompt',
        meta: { label: 'Prompt' },
        cell: ({ row }) => row.original.promptVersion,
      },
      {
        id: 'tokens',
        header: 'Tokens in/out',
        meta: { label: 'Tokens' },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.inputTokens}/{row.original.outputTokens}
          </span>
        ),
      },
      {
        id: 'latency',
        header: 'Latency',
        meta: { label: 'Latency' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.latencyMs} ms</span>,
      },
      {
        id: 'cost',
        header: 'Est. cost',
        meta: { label: 'Cost' },
        cell: ({ row }) => (
          <span className="tabular-nums">{usd(row.original.estimatedCostMicroUsd)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'SUCCEEDED' ? 'success' : 'destructive'}>
            {row.original.status === 'SUCCEEDED'
              ? 'OK'
              : (row.original.errorCode ?? row.original.status)}
          </Badge>
        ),
      },
      {
        id: 'user',
        header: 'User',
        meta: { label: 'User' },
        cell: ({ row }) => row.original.user?.name ?? '—',
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="AI usage"
        description="Every AI call is logged. Cost is an estimate from token counts."
      />
      {usage.error ? (
        <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                This month
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {usage.data ? usd(usage.data.monthToDateMicroUsd) : '…'}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly budget
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {usage.data
                ? usage.data.budgetMicroUsd > 0
                  ? usd(usage.data.budgetMicroUsd)
                  : 'No limit'
                : '…'}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Provider</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">
              {usage.data ? `${usage.data.provider} · ${usage.data.model}` : '…'}
            </CardContent>
          </Card>
          {usage.data && usage.data.byFeature.length > 0 && (
            <Card className="sm:col-span-3">
              <CardHeader>
                <CardTitle>By feature (this month)</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {usage.data.byFeature.map((f) => (
                    <li key={f.feature} className="flex justify-between gap-2">
                      <span>{AI_FEATURE_LABELS[f.feature]}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {f.calls} calls{f.failed ? `, ${f.failed} failed` : ''} ·{' '}
                        {usd(f.costMicroUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      <DataTable
        columns={columns}
        data={requests.data?.data}
        meta={requests.data?.meta}
        isLoading={requests.isPending}
        error={requests.error}
        onRetry={() => void requests.refetch()}
        sort="-createdAt"
        onSortChange={() => undefined}
        onPageChange={(p) => update({ page: String(p) })}
        emptyTitle="No AI calls yet"
      />
    </>
  );
}
