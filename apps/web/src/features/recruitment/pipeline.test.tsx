import type { Job, Pipeline } from '@staffos/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, renderApp, sessionResponse } from '@/test/render';

const JOB_ID = '0199a1b2-0000-7000-8000-00000000001a';
const RECRUITER_ID = '0199a1b2-0000-7000-8000-000000000001';
const person = (id: string, name: string) => ({ id, name });

const job: Job = {
  id: JOB_ID,
  slug: 'forklift-operator-abc123',
  title: 'Forklift Operator',
  description: null,
  category: 'DRIVER',
  location: 'KEZAD',
  emirate: 'ABU_DHABI',
  headcount: 8,
  salaryMinFils: null,
  salaryMaxFils: null,
  currency: 'AED',
  showClientName: false,
  status: 'OPEN',
  version: 2,
  client: { id: '0199a1b2-0000-7000-8000-0000000000c1', name: 'Al Noor Logistics LLC' },
  manpowerRequestId: '0199a1b2-0000-7000-8000-00000000003c',
  hiringManager: person('0199a1b2-0000-7000-8000-00000000004d', 'Fatima Al Zaabi'),
  recruiters: [person(RECRUITER_ID, 'Priya Nair')],
  skills: [{ name: 'Forklift licence', weight: 'MUST', minYears: 2 }],
  applicationCount: 1,
  publishedAt: '2026-10-01T08:00:00.000Z',
  createdAt: '2026-10-01T07:00:00.000Z',
};

const card = {
  id: '0199a1b2-0000-7000-8000-0000000000a1',
  version: 1,
  stage: 'APPLIED' as const,
  candidate: {
    id: '0199a1b2-0000-7000-8000-00000000002b',
    name: 'Rania Saeed',
    currentTitle: 'Warehouse Operator',
  },
  daysInStage: 3,
};
const pipeline: Pipeline = {
  job: { id: JOB_ID, title: job.title, status: 'OPEN' },
  columns: (
    [
      'APPLIED',
      'SCREENING',
      'SHORTLISTED',
      'INTERVIEW',
      'OFFER',
      'HIRED',
      'REJECTED',
      'WITHDRAWN',
    ] as const
  ).map((stage) => ({
    stage,
    count: stage === 'APPLIED' ? 1 : 0,
    applications: stage === 'APPLIED' ? [card] : [],
  })),
};

const recruiter = (id = RECRUITER_ID) =>
  sessionResponse({
    id,
    roles: ['RECRUITER'],
    permissions: ['jobs:read', 'applications:read', 'applications:transition', 'candidates:read'],
  });

describe('job pipeline', () => {
  it('offers only legal moves and sends the version with the transition', async () => {
    let sent: unknown;
    mockApi({
      'POST /api/v1/auth/refresh': () => recruiter(),
      [`GET /api/v1/jobs/${JOB_ID}`]: () => jsonResponse(job),
      [`GET /api/v1/jobs/${JOB_ID}/pipeline`]: () => jsonResponse(pipeline),
      [`POST /api/v1/applications/${card.id}/transition`]: (init) => {
        sent = JSON.parse(String(init?.body));
        return jsonResponse({});
      },
    });
    renderApp(`/jobs/${JOB_ID}`);

    expect(await screen.findByRole('region', { name: 'Applied: 1' })).toHaveTextContent(
      'Rania Saeed',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Move Rania Saeed' }));
    const menu = await screen.findByRole('menu');
    const options = within(menu)
      .getAllByRole('menuitem')
      .map((m) => m.textContent);
    expect(options).toEqual(['Screening', 'Rejected', 'Withdrawn']);

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Screening' }));
    await waitFor(() => expect(sent).toEqual({ to: 'SCREENING', version: 1 }));
  });

  it('asks for a reason before rejecting', async () => {
    let sent: unknown;
    mockApi({
      'POST /api/v1/auth/refresh': () => recruiter(),
      [`GET /api/v1/jobs/${JOB_ID}`]: () => jsonResponse(job),
      [`GET /api/v1/jobs/${JOB_ID}/pipeline`]: () => jsonResponse(pipeline),
      [`POST /api/v1/applications/${card.id}/transition`]: (init) => {
        sent = JSON.parse(String(init?.body));
        return jsonResponse({});
      },
    });
    renderApp(`/jobs/${JOB_ID}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Move Rania Saeed' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rejected' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'No forklift licence');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(sent).toEqual({ to: 'REJECTED', version: 1, reason: 'No forklift licence' }),
    );
  });

  it('is read-only for a recruiter who is not assigned to the job', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': () => recruiter('0199a1b2-0000-7000-8000-0000000000ff'),
      [`GET /api/v1/jobs/${JOB_ID}`]: () => jsonResponse(job),
      [`GET /api/v1/jobs/${JOB_ID}/pipeline`]: () => jsonResponse(pipeline),
    });
    renderApp(`/jobs/${JOB_ID}`);

    expect(await screen.findByText('Rania Saeed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Rania Saeed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add candidate' })).not.toBeInTheDocument();
  });
});
