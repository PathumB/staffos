import * as Sentry from '@sentry/node';

let enabled = false;

/**
 * Error tracking on Sentry's free tier, only when SENTRY_DSN is set. No personal data is sent
 * (the SDK default), and request headers, cookies and bodies are dropped before sending.
 */
export function initSentry(dsn: string | undefined, environment: string, release?: string): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
      }
      delete event.user;
      return event;
    },
  });
  enabled = true;
}

/** Reports an unexpected (5xx) error with its trace id so it can be matched to the logs. */
export function captureError(error: unknown, traceId?: string): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (traceId) scope.setTag('traceId', traceId);
    Sentry.captureException(error);
  });
}
