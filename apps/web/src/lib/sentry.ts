import * as Sentry from '@sentry/react';

/**
 * Browser error tracking (Sentry free tier), only when VITE_SENTRY_DSN is set at build time.
 * No personal data (the SDK default); user info and request headers are dropped too.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.user;
      if (event.request) delete event.request.headers;
      return event;
    },
  });
}
