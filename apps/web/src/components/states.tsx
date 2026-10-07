import { CircleAlert, Inbox, Loader2, ShieldX } from 'lucide-react';
import { ApiClientError } from '@/lib/api-client';
import { Button } from './ui/button';

// Every page handles loading, empty, error and permission-denied states (CLAUDE.md §10).

export function FullPageSpinner() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiClientError && error.status === 403) return <PermissionDenied />;
  const traceId = error instanceof ApiClientError ? error.error.traceId : undefined;
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center"
    >
      <CircleAlert className="size-8 text-destructive" aria-hidden />
      <p className="font-medium">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error instanceof ApiClientError
          ? error.message
          : 'Please check your connection and try again.'}
        {traceId && <span className="mt-1 block font-mono text-xs">Reference: {traceId}</span>}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PermissionDenied() {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center"
    >
      <ShieldX className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ask a Super Admin if you need access for your role.
      </p>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
