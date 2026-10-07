import { CircleAlert, CircleCheck, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api-client';
import { useHealth } from '../api';

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge variant="success">
      <CircleCheck className="size-3.5" aria-hidden />
      Operational
    </Badge>
  ) : (
    <Badge variant="destructive">
      <CircleAlert className="size-3.5" aria-hidden />
      Unavailable
    </Badge>
  );
}

export function HealthStatusCard() {
  const { data, error, isPending, isError, refetch, isFetching } = useHealth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardDescription>Live check of the API and its database.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Checking API…
          </p>
        )}

        {isError && (
          <div role="alert" className="space-y-3">
            <p className="text-sm">
              <span className="font-medium text-destructive">API unreachable.</span>{' '}
              <span className="text-muted-foreground">
                {error instanceof ApiClientError
                  ? `${error.message} (trace ${error.error.traceId})`
                  : 'Is the API running on port 3000?'}
              </span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw aria-hidden className={isFetching ? 'animate-spin' : undefined} />
              Retry
            </Button>
          </div>
        )}

        {data && (
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">API</dt>
            <dd>
              <StatusBadge ok />
            </dd>
            <dt className="text-muted-foreground">Database</dt>
            <dd>
              <StatusBadge ok={data.checks.db === 'ok'} />
            </dd>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono text-xs">{data.version}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
