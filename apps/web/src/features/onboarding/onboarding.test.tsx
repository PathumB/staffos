import type { Employee, OnboardingPlan, Permission } from '@staffos/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, renderApp, sessionResponse } from '@/test/render';

const EMP_ID = '0199a1b2-0000-7000-8000-0000000000e1';
const PLAN_ID = '0199a1b2-0000-7000-8000-0000000000a9';
const TASK_MINE = '0199a1b2-0000-7000-8000-0000000000b1';
const TASK_HR = '0199a1b2-0000-7000-8000-0000000000b2';

const employee: Employee = {
  id: EMP_ID,
  employeeNumber: 'EMP-001001',
  firstName: 'Joseph',
  lastName: 'Mwangi',
  email: 'joseph@example.test',
  phone: null,
  status: 'ONBOARDING',
  hireDate: '2027-02-01',
  salaryFils: 450_000,
  currency: 'AED',
  version: 3,
  department: null,
  position: null,
  account: { id: '0199a1b2-0000-7000-8000-000000000001', status: 'ACTIVE' },
  candidateId: null,
  applicationId: null,
  job: null,
  onboarding: { planId: PLAN_ID, status: 'IN_PROGRESS', done: 0, total: 2 },
  createdAt: '2026-10-01T08:00:00.000Z',
};

const task = (id: string, title: string, canComplete: boolean) => ({
  id,
  title,
  description: null,
  type: 'DOCUMENTS' as const,
  assigneeRole: canComplete ? ('EMPLOYEE' as const) : ('HR_MANAGER' as const),
  assignee: null,
  dueDate: '2099-01-01',
  required: true,
  status: 'PENDING' as const,
  completedAt: null,
  completedBy: null,
  note: null,
  canComplete,
});

const plan: OnboardingPlan = {
  id: PLAN_ID,
  status: 'IN_PROGRESS',
  startDate: '2027-02-01',
  completedAt: null,
  employee: { id: EMP_ID, name: 'Joseph Mwangi', employeeNumber: 'EMP-001001' },
  template: null,
  progress: { done: 0, total: 2, overdue: 0 },
  tasks: [task(TASK_MINE, 'Sign contract', true), task(TASK_HR, 'Visa', false)],
  createdAt: '2026-10-01T08:00:00.000Z',
};

const employeeSession = (extra: Permission[] = []) =>
  sessionResponse({
    id: '0199a1b2-0000-7000-8000-000000000001',
    roles: ['EMPLOYEE'],
    employeeId: EMP_ID,
    permissions: [
      'employees:read',
      'employees:write',
      'onboarding:read',
      'onboarding:write',
      ...extra,
    ],
  });

describe('employee self-service', () => {
  it('goes straight to my profile and lets me complete only my own tasks', async () => {
    let sent: unknown;
    mockApi({
      'POST /api/v1/auth/refresh': () => employeeSession(),
      [`GET /api/v1/employees/${EMP_ID}`]: () => jsonResponse(employee),
      [`GET /api/v1/onboarding-plans/${PLAN_ID}`]: () => jsonResponse(plan),
      [`POST /api/v1/onboarding-tasks/${TASK_MINE}/complete`]: (init) => {
        sent = JSON.parse(String(init?.body));
        return jsonResponse(plan);
      },
    });
    renderApp('/employees');

    expect(await screen.findByRole('heading', { name: /Joseph Mwangi/ })).toBeInTheDocument();
    const buttons = await screen.findAllByRole('button', { name: 'Mark done' });
    expect(buttons).toHaveLength(1); // the HR visa task isn't mine
    await userEvent.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Note/), 'Signed today');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(sent).toEqual({ note: 'Signed today' }));
  });

  it('only offers my contact details for editing', async () => {
    let sent: unknown;
    mockApi({
      'POST /api/v1/auth/refresh': () => employeeSession(),
      [`GET /api/v1/employees/${EMP_ID}`]: () => jsonResponse(employee),
      [`GET /api/v1/onboarding-plans/${PLAN_ID}`]: () => jsonResponse(plan),
      [`PATCH /api/v1/employees/${EMP_ID}`]: (init) => {
        sent = JSON.parse(String(init?.body));
        return jsonResponse(employee);
      },
    });
    renderApp(`/employees/${EMP_ID}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit contact details' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Salary (AED/month)')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Status')).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Phone'), '+971 50 123 4567');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sent).toEqual({ version: 3, email: 'joseph@example.test', phone: '+971 50 123 4567' }),
    );
  });

  it('shows unread notifications in the bell and opens the linked page', async () => {
    let marked = false;
    mockApi({
      'POST /api/v1/auth/refresh': () => employeeSession(['notifications:read']),
      'GET /api/v1/notifications/unread-count': () => jsonResponse({ count: 1 }),
      'GET /api/v1/notifications': () =>
        jsonResponse({
          data: [
            {
              id: '0199a1b2-0000-7000-8000-0000000000c9',
              type: 'onboarding.task_assigned',
              title: 'Onboarding task: Visa',
              body: null,
              link: `/employees/${EMP_ID}`,
              readAt: null,
              createdAt: '2026-10-08T08:00:00.000Z',
            },
          ],
          meta: { page: 1, pageSize: 10, total: 1 },
        }),
      'POST /api/v1/notifications/0199a1b2-0000-7000-8000-0000000000c9/read': () => {
        marked = true;
        return jsonResponse({
          id: '0199a1b2-0000-7000-8000-0000000000c9',
          type: 'onboarding.task_assigned',
          title: 'Onboarding task: Visa',
          body: null,
          link: `/employees/${EMP_ID}`,
          readAt: '2026-10-08T09:00:00.000Z',
          createdAt: '2026-10-08T08:00:00.000Z',
        });
      },
      [`GET /api/v1/employees/${EMP_ID}`]: () => jsonResponse(employee),
      [`GET /api/v1/onboarding-plans/${PLAN_ID}`]: () => jsonResponse(plan),
    });
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Onboarding task: Visa/ }));
    await waitFor(() => expect(marked).toBe(true));
    expect(await screen.findByRole('heading', { name: /Joseph Mwangi/ })).toBeInTheDocument();
  });
});
