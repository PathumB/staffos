import { createBrowserRouter } from 'react-router';
import { AuditLogPage } from '@/features/audit/pages/AuditLogPage';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequirePermission,
} from '@/features/auth/components/guards';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  ResetPasswordPage,
} from '@/features/auth/pages/PasswordPages';
import { ClientDetailPage } from '@/features/clients/pages/ClientDetailPage';
import { ClientsPage } from '@/features/clients/pages/ClientsPage';
import { RequestDetailPage } from '@/features/manpower-requests/pages/RequestDetailPage';
import { RequestsPage } from '@/features/manpower-requests/pages/RequestsPage';
import { RolesPage } from '@/features/users/pages/RolesPage';
import { UsersPage } from '@/features/users/pages/UsersPage';
import { AppLayout } from './layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Routes grow per module: internal app, /careers (public) and /client-portal.
export const routes = [
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          {
            path: '/clients',
            element: (
              <RequirePermission permissions={['clients:read']}>
                <ClientsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/clients/:id',
            element: (
              <RequirePermission permissions={['clients:read']}>
                <ClientDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: '/requests',
            element: (
              <RequirePermission permissions={['manpower-requests:read']}>
                <RequestsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/requests/:id',
            element: (
              <RequirePermission permissions={['manpower-requests:read']}>
                <RequestDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: '/admin/users',
            element: (
              <RequirePermission permissions={['users:read']}>
                <UsersPage />
              </RequirePermission>
            ),
          },
          {
            path: '/admin/roles',
            element: (
              <RequirePermission permissions={['users:read']}>
                <RolesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/admin/audit-log',
            element: (
              <RequirePermission permissions={['audit:read']}>
                <AuditLogPage />
              </RequirePermission>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
