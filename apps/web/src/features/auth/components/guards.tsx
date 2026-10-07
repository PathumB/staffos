import type { Permission } from '@staffos/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner, PermissionDenied } from '@/components/states';
import { useAuth } from '../AuthProvider';

/** Routes inside require a signed-in user; otherwise redirect to /login?next=… */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** Public-only routes (login, reset): signed-in users go to the dashboard. */
export function RedirectIfAuthenticated() {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Shows a permission-denied state instead of the page. UX only — the API enforces access
 * (CLAUDE.md §10: never rely on hidden UI for security).
 */
export function RequirePermission({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  return can(...permissions) ? children : <PermissionDenied />;
}
