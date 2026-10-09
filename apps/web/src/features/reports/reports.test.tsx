import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, renderApp, sessionResponse } from '@/test/render';

const funnel = {
  stages: ['APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED'].map(
    (stage, i) => ({
      stage,
      count: 10 - i,
    }),
  ),
  conversion: 0.5,
};

describe('reports', () => {
  it('shows role widgets on the dashboard', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': () =>
        sessionResponse({ roles: ['HR_MANAGER'], permissions: ['reports:read'] }),
      'GET /api/v1/reports/dashboard': () =>
        jsonResponse({
          widgets: [
            {
              key: 'tasks',
              label: 'My open tasks',
              value: 3,
              format: 'number',
              hint: null,
              link: '/tasks',
            },
            {
              key: 'outstanding',
              label: 'Unpaid invoices',
              value: 105000,
              format: 'money',
              hint: null,
              link: null,
            },
          ],
          funnel,
          openRequests: null,
          revenueByMonth: null,
        }),
      'GET /api/v1/health': () =>
        jsonResponse({ status: 'ok', version: '0.1.0', uptimeS: 1, checks: { db: 'ok' } }),
    });
    renderApp('/');
    expect(await screen.findByText('My open tasks')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My open tasks/ })).toHaveAttribute('href', '/tasks');
    expect(screen.getByText(/1,050\.00/)).toBeInTheDocument();
    expect(screen.getByText('Hiring funnel')).toBeInTheDocument();
  });

  it('asks a question and shows the answer, table and SQL, labelled as AI-assisted', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': () =>
        sessionResponse({ roles: ['HR_MANAGER'], permissions: ['reports:read', 'ai:ask-data'] }),
      'GET /api/v1/reports/hiring-funnel': () => jsonResponse(funnel),
      'POST /api/v1/ai/ask-data': () =>
        jsonResponse({
          question: 'q',
          answer: 'Two clients have requests open for more than 30 days.',
          sql: 'SELECT client_name, COUNT(*) AS open FROM v_open_requests WHERE age_days > 30 GROUP BY 1',
          columns: ['client_name', 'open'],
          rows: [
            { client_name: 'Gulf Build', open: 2 },
            { client_name: 'Desert Logistics', open: 1 },
          ],
          truncated: false,
          chart: { type: 'none', x: null, y: null },
        }),
    });
    renderApp('/reports');
    await userEvent.click(await screen.findByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/Two clients have requests open/)).toBeInTheDocument();
    expect(screen.getByText('AI-assisted suggestion')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Gulf Build' })).toBeInTheDocument();
    expect(screen.getByText(/FROM v_open_requests/)).toBeInTheDocument();
  });
});
