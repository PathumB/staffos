import {
  ACTION_LABELS,
  AUTOMATION_EVENT_FIELDS,
  AUTOMATION_EVENT_LABELS,
  type AutomationRule,
  type AutomationRun,
  type AutomationTestResult,
  CONDITION_OP_LABELS,
  type RunStatus,
} from '@staffos/shared';
import { FlaskConical, Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useListParams } from '@/lib/list-params';
import { useDeleteRule, useRetryRun, useRules, useRuns, useSaveRule, useTestRule } from '../api';
import { RuleFormDialog } from '../components/RuleFormDialog';

const STATUS_VARIANT: Record<RunStatus, 'success' | 'destructive' | 'secondary' | 'warning'> = {
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  RUNNING: 'warning',
  PENDING: 'secondary',
};

const describeConditions = (rule: AutomationRule) =>
  rule.conditions.length === 0
    ? 'always'
    : rule.conditions
        .map(
          (c) =>
            `${c.field} ${CONDITION_OP_LABELS[c.op]} ${Array.isArray(c.value) ? c.value.join(', ') : String(c.value)}`,
        )
        .join(' and ');

/** US-AUTO-01: rules (When / If / Then), dry runs, and the run log with retry. */
export function AutomationsPage() {
  const rules = useRules();
  const saveRule = useSaveRule();
  const deleteRule = useDeleteRule();
  const [editing, setEditing] = useState<AutomationRule | 'new' | null>(null);
  const [testing, setTesting] = useState<AutomationRule | null>(null);
  const [deleting, setDeleting] = useState<AutomationRule | null>(null);

  const toggle = async (rule: AutomationRule) => {
    try {
      await saveRule.mutateAsync({ id: rule.id, input: { active: !rule.active } });
      toast.success(rule.active ? 'Rule paused.' : 'Rule activated.');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update the rule.');
    }
  };

  return (
    <>
      <PageHeader
        title="Automations"
        description="When an event happens, rules whose conditions match run in the background."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            New rule
          </Button>
        }
      />
      {rules.error ? (
        <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
      ) : rules.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rules.data.length === 0 ? (
        <EmptyState title="No rules yet" description="Create a rule to automate a follow-up." />
      ) : (
        <ul className="grid gap-3">
          {rules.data.map((rule) => (
            <li key={rule.id}>
              <Card>
                <CardContent className="grid gap-2 pt-4 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant={rule.active ? 'success' : 'secondary'}>
                        {rule.active ? 'Active' : 'Paused'}
                      </Badge>
                      {rule.lastRun && (
                        <Badge variant={STATUS_VARIANT[rule.lastRun.status]}>
                          Last run: {rule.lastRun.status.toLowerCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <strong className="font-medium text-foreground">When</strong>{' '}
                      {AUTOMATION_EVENT_LABELS[rule.event].toLowerCase()}{' '}
                      <strong className="font-medium text-foreground">if</strong>{' '}
                      {describeConditions(rule)}{' '}
                      <strong className="font-medium text-foreground">then</strong>{' '}
                      {rule.actions.map((a) => ACTION_LABELS[a.type].toLowerCase()).join(', ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => void toggle(rule)}>
                      {rule.active ? 'Pause' : 'Activate'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Test ${rule.name}`}
                      onClick={() => setTesting(rule)}
                    >
                      <FlaskConical aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => setEditing(rule)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setDeleting(rule)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <RunLog />

      <RuleFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        rule={editing === 'new' || editing === null ? undefined : editing}
      />
      <TestRuleDialog rule={testing} onClose={() => setTesting(null)} />
      <ActionDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this rule?"
        description="It stops running at once. Its past runs stay in the log."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await deleteRule.mutateAsync(deleting.id);
          toast.success('Rule deleted.');
        }}
      />
    </>
  );
}

function RunLog() {
  const { get, update } = useListParams();
  const page = Number(get('page') ?? 1);
  const status = (get('status') as RunStatus | undefined) ?? undefined;
  const runs = useRuns({ page, pageSize: 20, status });
  const retry = useRetryRun();
  const statusId = useId();

  const columns = useMemo<DataTableColumn<AutomationRun>[]>(
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
        id: 'rule',
        header: 'Rule',
        meta: { label: 'Rule' },
        cell: ({ row }) => row.original.rule.name,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {row.original.status.toLowerCase()}
          </Badge>
        ),
      },
      {
        id: 'details',
        header: 'Input / result',
        meta: { label: 'Details' },
        cell: ({ row }) => (
          <details className="max-w-md text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {row.original.error ?? `${row.original.attempts} attempt(s)`}
            </summary>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2">
              {JSON.stringify(
                { input: row.original.payload, result: row.original.result },
                null,
                2,
              )}
            </pre>
          </details>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          row.original.status === 'FAILED' && (
            <Button
              variant="outline"
              size="sm"
              disabled={retry.isPending}
              onClick={() =>
                retry.mutate(row.original.id, {
                  onSuccess: (r) =>
                    toast[r.status === 'FAILED' ? 'error' : 'success'](
                      r.status === 'FAILED' ? 'The run failed again.' : 'Run retried.',
                    ),
                  onError: (error) =>
                    toast.error(error instanceof ApiClientError ? error.message : 'Retry failed.'),
                })
              }
            >
              <RotateCcw aria-hidden />
              Retry
            </Button>
          ),
      },
    ],
    [retry],
  );

  return (
    <section className="mt-8 grid gap-3" aria-labelledby="run-log">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="run-log" className="text-lg font-semibold">
          Run log
        </h2>
        <div className="grid gap-1">
          <Label htmlFor={statusId}>Status</Label>
          <NativeSelect
            id={statusId}
            value={status ?? ''}
            onChange={(e) => update({ status: e.target.value || undefined, page: undefined })}
          >
            <option value="">All</option>
            <option value="FAILED">Failed</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="PENDING">Pending</option>
            <option value="RUNNING">Running</option>
          </NativeSelect>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={runs.data?.data}
        meta={runs.data?.meta}
        isLoading={runs.isPending}
        error={runs.error}
        onRetry={() => void runs.refetch()}
        sort="-createdAt"
        onSortChange={() => undefined}
        onPageChange={(p) => update({ page: String(p) })}
        emptyTitle="No runs yet"
      />
    </section>
  );
}

function TestRuleDialog({ rule, onClose }: { rule: AutomationRule | null; onClose: () => void }) {
  const test = useTestRule();
  const id = useId();
  const [text, setText] = useState('');
  const [result, setResult] = useState<AutomationTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forRule, setForRule] = useState<string | null>(null);

  // Prefill a sample payload with the event's fields when a new rule is opened.
  if (rule && forRule !== rule.id) {
    setForRule(rule.id);
    setResult(null);
    setError(null);
    setText(
      JSON.stringify(
        Object.fromEntries(AUTOMATION_EVENT_FIELDS[rule.event].map((f) => [f, ''])),
        null,
        2,
      ),
    );
  }

  const run = async () => {
    if (!rule) return;
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      setError('Sample payload must be valid JSON.');
      return;
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      setError('Sample payload must be a JSON object.');
      return;
    }
    setError(null);
    try {
      setResult(
        await test.mutateAsync({ id: rule.id, payload: payload as Record<string, unknown> }),
      );
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'The test failed.');
    }
  };

  return (
    <Dialog
      open={rule !== null}
      onOpenChange={(o) => {
        if (!o) {
          setForRule(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test “{rule?.name}”</DialogTitle>
          <DialogDescription>Dry run with sample data. Nothing is executed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={id}>Sample event data (JSON)</Label>
          <Textarea
            id={id}
            rows={8}
            className="font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {result.matched ? 'Conditions match: the rule would run' : 'Conditions don’t match'}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <ul className="grid gap-1">
                {result.conditions.map((c, i) => (
                  <li key={i}>
                    {c.passed ? '✓' : '✗'} {c.condition.field} {CONDITION_OP_LABELS[c.condition.op]}{' '}
                    {String(c.condition.value)}
                  </li>
                ))}
              </ul>
              {result.actions.length > 0 && (
                <ol className="list-decimal pl-5">
                  {result.actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setForRule(null);
              onClose();
            }}
          >
            Close
          </Button>
          <Button onClick={() => void run()} disabled={test.isPending}>
            {test.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Run test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
