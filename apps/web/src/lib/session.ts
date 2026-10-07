import { type LoginResponse, loginResponseSchema, type Me } from '@staffos/shared';

/**
 * Session state. The access token lives in memory only (never localStorage — CLAUDE.md §10);
 * the refresh token is an httpOnly cookie the browser sends to /api/v1/auth automatically.
 */
let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<LoginResponse | null> | null = null;
const listeners = new Set<(user: Me | null) => void>();

// Other tabs learn about logout so they don't keep showing private data.
const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('staffos-auth');
channel?.addEventListener('message', (event) => {
  if (event.data === 'logout') endSession(false);
});

export function getAccessToken(): string | null {
  return accessToken;
}

export function onSessionChange(listener: (user: Me | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startSession(session: LoginResponse): void {
  accessToken = session.accessToken;
  clearTimeout(refreshTimer);
  // Refresh a minute before expiry so requests rarely hit a 401.
  refreshTimer = setTimeout(
    () => void refreshSession(),
    Math.max(session.expiresIn - 60, 10) * 1000,
  );
  listeners.forEach((l) => l(session.user));
}

export function endSession(broadcast = true): void {
  accessToken = null;
  clearTimeout(refreshTimer);
  listeners.forEach((l) => l(null));
  if (broadcast) channel?.postMessage('logout');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestRefresh(attempt: number): Promise<LoginResponse | null> {
  const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  if (res.ok) {
    return loginResponseSchema.parse(await res.json());
  }
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  // Another tab rotated the cookie a moment ago; the browser now holds the new one.
  if (body?.code === 'TOKEN_ROTATED' && attempt < 2) {
    await sleep(300);
    return requestRefresh(attempt + 1);
  }
  return null;
}

/** Single-flight: concurrent callers share one refresh request. Resolves null when signed out. */
export function refreshSession(): Promise<LoginResponse | null> {
  inFlight ??= requestRefresh(0)
    .catch(() => null)
    .then((session) => {
      if (session) startSession(session);
      else endSession(false);
      return session;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
