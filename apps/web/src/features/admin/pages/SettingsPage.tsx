import { zodResolver } from '@hookform/resolvers/zod';
import {
  type IntegrationStatus,
  SETTING_LABELS,
  type Settings,
  settingsSchema,
} from '@staffos/shared';
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { FormField } from '@/components/form-field';
import { ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import {
  useDemoReset,
  useIntegrations,
  useSaveSettings,
  useSettings,
  useSystemHealth,
  useZohoSync,
} from '../api';

const STATUS: Record<
  IntegrationStatus['status'],
  { label: string; variant: 'success' | 'secondary' | 'warning' }
> = {
  ok: { label: 'Connected', variant: 'success' },
  dev_only: { label: 'Development mode', variant: 'warning' },
  not_configured: { label: 'Not configured', variant: 'secondary' },
};

/** Admin: runtime settings, integration status (with Zoho sync) and system health. */
export function SettingsPage() {
  const { can } = useAuth();
  const canIntegrations = can('integrations:manage');
  const canHealth = can('system:health-detail');
  return (
    <>
      <PageHeader
        title="Settings and system"
        description="Changes apply immediately and are recorded in the audit log."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsCard />
        {canHealth && <SystemCard />}
        {canIntegrations && <IntegrationsCard />}
      </div>
    </>
  );
}

function SettingsCard() {
  const settings = useSettings();
  const save = useSaveSettings();
  const { register, handleSubmit, reset, formState } = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
  });
  useEffect(() => {
    if (settings.data) reset(settings.data);
  }, [settings.data, reset]);
  const e = formState.errors;
  const num = { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      toast.success('Settings saved.');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the settings.');
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business settings</CardTitle>
      </CardHeader>
      <CardContent>
        {settings.error ? (
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        ) : settings.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            {(Object.keys(SETTING_LABELS) as (keyof Settings)[]).map((key) => (
              <FormField
                key={key}
                label={SETTING_LABELS[key].label}
                hint={SETTING_LABELS[key].hint}
                error={e[key]?.message}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    step={key === 'ai.monthlyBudgetUsd' ? '0.01' : '1'}
                    {...register(key, num)}
                  />
                )}
              </FormField>
            ))}
            <Button
              type="submit"
              className="justify-self-start"
              disabled={formState.isSubmitting || !formState.isDirty}
            >
              {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
              Save settings
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function IntegrationsCard() {
  const integrations = useIntegrations(true);
  const sync = useZohoSync();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>Every external service sits behind a swappable provider.</CardDescription>
      </CardHeader>
      <CardContent>
        {integrations.error ? (
          <ErrorState error={integrations.error} onRetry={() => void integrations.refetch()} />
        ) : integrations.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y text-sm">
            {integrations.data.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">
                    {i.name}{' '}
                    <span className="font-normal text-muted-foreground">· {i.provider}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{i.detail}</span>
                </div>
                <Badge variant={STATUS[i.status].variant}>{STATUS[i.status].label}</Badge>
                {i.key === 'zoho' && i.status === 'ok' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sync.isPending}
                    onClick={() =>
                      sync.mutate(undefined, {
                        onSuccess: () => toast.success('Zoho sync started.'),
                        onError: (err) =>
                          toast.error(
                            err instanceof ApiClientError ? err.message : 'Sync failed to start.',
                          ),
                      })
                    }
                  >
                    <RefreshCw aria-hidden />
                    Sync now
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SystemCard() {
  const health = useSystemHealth(true);
  const reset = useDemoReset();
  const [confirm, setConfirm] = useState(false);
  const h = health.data;
  const rows: [string, string][] = h
    ? [
        ['Database', h.db === 'ok' ? 'OK' : 'Down'],
        [
          'Job queue',
          h.queue.mode === 'pg-boss'
            ? `pg-boss · ${h.queue.pending ?? 0} waiting`
            : 'Inline (no queue)',
        ],
        [
          'AI provider',
          `${h.ai.provider} · ${h.ai.model} · ${h.ai.last24h} calls, ${h.ai.failed24h} failed (24 h)`,
        ],
        ['Automation runs failed (24 h)', String(h.automationRuns.failed24h)],
        ['Last automation run', formatDateTime(h.automationRuns.last)],
        [
          'Webhook deliveries failed (24 h)',
          `${h.webhooks.failed24h} (${h.webhooks.pending} retrying)`,
        ],
        ['Emails waiting to send', String(h.notificationsUnsent)],
        ['Last Zoho sync', formatDateTime(h.lastSync.zoho)],
      ]
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>System health</CardTitle>
        <CardDescription>Refreshes every minute.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {health.error ? (
          <ErrorState error={health.error} onRetry={() => void health.refetch()} />
        ) : health.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <dl className="grid gap-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {h?.demoMode && (
          <>
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => setConfirm(true)}
            >
              <RotateCcw aria-hidden />
              Reset demo data
            </Button>
            <ActionDialog
              open={confirm}
              onOpenChange={setConfirm}
              title="Reset the demo data?"
              description="The demo seed runs again, recreating any demo records that were removed. Other data is kept."
              confirmLabel="Reset"
              destructive
              onConfirm={async () => {
                await reset.mutateAsync();
                toast.success('Demo data reset.');
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
