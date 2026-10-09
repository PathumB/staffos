import { createBrowserRouter } from 'react-router';
import { AuditLogPage } from '@/features/audit/pages/AuditLogPage';
import { ApprovalsPage } from '@/features/automation/pages/ApprovalsPage';
import { AutomationsPage } from '@/features/automation/pages/AutomationsPage';
import { WebhooksPage } from '@/features/automation/pages/WebhooksPage';
import { WorkflowsPage } from '@/features/automation/pages/WorkflowsPage';
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
import { CandidateDetailPage } from '@/features/recruitment/pages/CandidateDetailPage';
import { CandidatesPage } from '@/features/recruitment/pages/CandidatesPage';
import { JobDetailPage } from '@/features/recruitment/pages/JobDetailPage';
import { JobsPage } from '@/features/recruitment/pages/JobsPage';
import { AiUsagePage } from '@/features/ai/pages/AiUsagePage';
import { CareersLayout } from '@/features/careers/components/CareersLayout';
import { CareerJobPage } from '@/features/careers/pages/CareerJobPage';
import { CareersPage } from '@/features/careers/pages/CareersPage';
import { TrackPage } from '@/features/careers/pages/TrackPage';
import { ExpiringDocumentsPage } from '@/features/documents/pages/ExpiringDocumentsPage';
import { EmployeeDetailPage } from '@/features/employees/pages/EmployeeDetailPage';
import { EmployeesPage } from '@/features/employees/pages/EmployeesPage';
import { OrgPage } from '@/features/employees/pages/OrgPage';
import { ApplicationDetailPage } from '@/features/hiring/pages/ApplicationDetailPage';
import { InterviewsPage } from '@/features/hiring/pages/InterviewsPage';
import { InvoicePage } from '@/features/invoices/pages/InvoicePage';
import { InvoicesPage } from '@/features/invoices/pages/InvoicesPage';
import { OnboardingPage } from '@/features/onboarding/pages/OnboardingPage';
import { PlanDetailPage } from '@/features/onboarding/pages/PlanDetailPage';
import { TemplatesPage } from '@/features/onboarding/pages/TemplatesPage';
import { ReportsPage } from '@/features/reports/pages/ReportsPage';
import { TasksPage } from '@/features/reports/pages/TasksPage';
import { SettingsPage } from '@/features/admin/pages/SettingsPage';
import { RolesPage } from '@/features/users/pages/RolesPage';
import { DeploymentsPage } from '@/features/workforce/pages/DeploymentsPage';
import { TimesheetPage } from '@/features/workforce/pages/TimesheetPage';
import { TimesheetsPage } from '@/features/workforce/pages/TimesheetsPage';
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
  // Public careers site (no session).
  {
    element: <CareersLayout />,
    children: [
      { path: '/careers', element: <CareersPage /> },
      { path: '/careers/track/:token', element: <TrackPage /> },
      { path: '/careers/:slug', element: <CareerJobPage /> },
    ],
  },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          {
            path: '/jobs',
            element: (
              <RequirePermission permissions={['jobs:read']}>
                <JobsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/jobs/:id',
            element: (
              <RequirePermission permissions={['jobs:read']}>
                <JobDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: '/applications/:id',
            element: (
              <RequirePermission permissions={['applications:read']}>
                <ApplicationDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: '/interviews',
            element: (
              <RequirePermission permissions={['interviews:write', 'interview-feedback:write']} any>
                <InterviewsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/employees',
            element: (
              <RequirePermission permissions={['employees:read']}>
                <EmployeesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/employees/:id',
            element: (
              <RequirePermission permissions={['employees:read']}>
                <EmployeeDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: '/departments',
            element: (
              <RequirePermission permissions={['onboarding-templates:manage']}>
                <OrgPage />
              </RequirePermission>
            ),
          },
          {
            path: '/onboarding',
            element: (
              <RequirePermission permissions={['onboarding:read']}>
                <OnboardingPage />
              </RequirePermission>
            ),
          },
          {
            path: '/onboarding/templates',
            element: (
              <RequirePermission permissions={['onboarding-templates:manage']}>
                <TemplatesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/onboarding/:id',
            element: (
              <RequirePermission permissions={['onboarding:read']}>
                <PlanDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: '/documents/expiring',
            element: (
              <RequirePermission permissions={['documents:read-identity']}>
                <ExpiringDocumentsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/deployments',
            element: (
              <RequirePermission permissions={['deployments:read']}>
                <DeploymentsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/timesheets',
            element: (
              <RequirePermission permissions={['timesheets:read']}>
                <TimesheetsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/timesheets/:id',
            element: (
              <RequirePermission permissions={['timesheets:read']}>
                <TimesheetPage />
              </RequirePermission>
            ),
          },
          {
            path: '/invoices',
            element: (
              <RequirePermission permissions={['invoices:read']}>
                <InvoicesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/invoices/:id',
            element: (
              <RequirePermission permissions={['invoices:read']}>
                <InvoicePage />
              </RequirePermission>
            ),
          },
          {
            path: '/ai-usage',
            element: (
              <RequirePermission permissions={['ai:usage-read']}>
                <AiUsagePage />
              </RequirePermission>
            ),
          },
          {
            path: '/candidates',
            element: (
              <RequirePermission permissions={['candidates:read']}>
                <CandidatesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/candidates/:id',
            element: (
              <RequirePermission permissions={['candidates:read']}>
                <CandidateDetailPage />
              </RequirePermission>
            ),
          },
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
          { path: '/approvals', element: <ApprovalsPage /> },
          { path: '/tasks', element: <TasksPage /> },
          {
            path: '/reports',
            element: (
              <RequirePermission permissions={['reports:read']}>
                <ReportsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/admin/settings',
            element: (
              <RequirePermission permissions={['settings:manage']}>
                <SettingsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/admin/workflows',
            element: (
              <RequirePermission permissions={['workflows:manage']}>
                <WorkflowsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/admin/automations',
            element: (
              <RequirePermission permissions={['automations:manage']}>
                <AutomationsPage />
              </RequirePermission>
            ),
          },
          {
            path: '/admin/webhooks',
            element: (
              <RequirePermission permissions={['webhooks:manage']}>
                <WebhooksPage />
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
