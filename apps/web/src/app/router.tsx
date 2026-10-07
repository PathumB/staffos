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
