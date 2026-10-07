import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, jsonResponse, mockApi, renderApp, sessionResponse } from '@/test/render';

const noSession = () => apiError('UNAUTHENTICATED', 401);
const health = () =>
  jsonResponse({ status: 'ok', version: '0.1.0', uptimeS: 1, checks: { db: 'ok' } });

describe('authentication flow', () => {
  it('redirects anonymous users to login, then back to the page they wanted', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': noSession,
      'POST /api/v1/auth/login': () => sessionResponse(),
      'GET /api/v1/health': health,
      'GET /api/v1/roles': () => jsonResponse([]),
    });
    const router = renderApp('/admin/roles');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Fadmin%2Froles');

    await userEvent.type(screen.getByLabelText('Email'), 'layla@staffos.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'StaffOS-Demo-2026!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Roles & permissions' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/roles');
  });

  it('validates the form before calling the API', async () => {
    const fetchMock = mockApi({ 'POST /api/v1/auth/refresh': noSession });
    renderApp('/login');

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the session restore
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'Email or password is incorrect.'],
    ['ACCOUNT_LOCKED', 429, 'Too many failed attempts. Try again in 15 minutes'],
  ])('shows a clear message for %s', async (code, status, message) => {
    mockApi({
      'POST /api/v1/auth/refresh': noSession,
      'POST /api/v1/auth/login': () => apiError(code, status, code, { retryAfterSeconds: 900 }),
    });
    renderApp('/login');

    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('restores the session from the refresh cookie and hides admin links without permission', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': () =>
        sessionResponse({ roles: ['RECRUITER'], permissions: ['candidates:read'] }),
      'GET /api/v1/health': health,
    });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Welcome, Layla' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('shows permission denied for a page the role cannot open', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': () =>
        sessionResponse({ roles: ['RECRUITER'], permissions: ['candidates:read'] }),
    });
    renderApp('/admin/audit-log');

    expect(await screen.findByRole('heading', { name: /don.t have access/ })).toBeInTheDocument();
  });

  it('signs out and returns to login', async () => {
    const fetchMock = mockApi({
      'POST /api/v1/auth/refresh': () => sessionResponse(),
      'POST /api/v1/auth/logout': () => jsonResponse(null, 204),
      'GET /api/v1/health': health,
    });
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: /Account menu/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
