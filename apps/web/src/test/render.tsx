import type { Me } from '@staffos/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '@/app/router';
import { ThemeProvider } from '@/app/theme';
import { AuthProvider } from '@/features/auth/AuthProvider';

function testQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Renders with a fresh QueryClient (no retries, so error states appear immediately). */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(
    <QueryClientProvider client={testQueryClient()}>{ui}</QueryClientProvider>,
    options,
  );
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const apiError = (
  code: string,
  status: number,
  message = code,
  details: Record<string, unknown> = {},
) => jsonResponse({ code, message, details, traceId: 'trace-test' }, status);

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** Stubs fetch by "METHOD /path" (query string ignored). Unmatched calls fail loudly. */
export function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function sessionResponse(user: Partial<Me> = {}) {
  return jsonResponse({
    accessToken: 'access-token',
    expiresIn: 900,
    user: {
      id: '0199a1b2-0000-7000-8000-000000000001',
      email: 'layla@staffos.demo',
      firstName: 'Layla',
      lastName: 'Haddad',
      roles: ['SUPER_ADMIN'],
      permissions: ['users:read', 'users:manage', 'audit:read'],
      clientId: null,
      employeeId: null,
      ...user,
    },
  });
}

/** Renders the real route tree at `path` with all app providers. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <QueryClientProvider client={testQueryClient()}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return router;
}
