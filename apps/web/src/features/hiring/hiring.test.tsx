import type { Application, Job, Offer } from '@staffos/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, renderApp, sessionResponse } from '@/test/render';

const APP_ID = '0199a1b2-0000-7000-8000-0000000000a1';
const JOB_ID = '0199a1b2-0000-7000-8000-00000000001a';
const RECRUITER_ID = '0199a1b2-0000-7000-8000-000000000001';
const HM_ID = '0199a1b2-0000-7000-8000-00000000004d';
const OFFER_ID = '0199a1b2-0000-7000-8000-0000000000f1';
const person = (id: string, name: string) => ({ id, name });

const application = (stage: Application['stage']): Application => ({
  id: APP_ID,
  stage,
  version: 5,
  rejectReason: null,
  appliedAt: '2026-10-01T08:00:00.000Z',
  stageChangedAt: '2026-10-05T08:00:00.000Z',
  candidate: {
    id: '0199a1b2-0000-7000-8000-00000000002b',
    name: 'Rania Saeed',
    currentTitle: null,
  },
  job: {
    id: JOB_ID,
    title: 'Forklift Operator',
    client: { id: '0199a1b2-0000-7000-8000-0000000000c1', name: 'Al Noor Logistics LLC' },
  },
  history: [
    {
      fromStage: null,
      toStage: 'APPLIED',
      reason: null,
      changedBy: null,
      changedAt: '2026-10-01T08:00:00.000Z',
    },
  ],
});

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
  hiringManager: person(HM_ID, 'Fatima Al Zaabi'),
  recruiters: [person(RECRUITER_ID, 'Priya Nair')],
  skills: [],
  applicationCount: 1,
  publishedAt: '2026-10-01T08:00:00.000Z',
  createdAt: '2026-10-01T07:00:00.000Z',
};

const offer = (status: Offer['status']): Offer => ({
  id: OFFER_ID,
  applicationId: APP_ID,
  salaryFils: 550_000,
  currency: 'AED',
  startDate: '2027-03-01',
  contractType: 'FIXED_TERM',
  contractMonths: 24,
  notes: null,
  status,
  version: 3,
  candidate: person('0199a1b2-0000-7000-8000-00000000002b', 'Rania Saeed'),
  job: { id: JOB_ID, title: 'Forklift Operator' },
  approvedBy: null,
  approvedAt: null,
  sentAt: null,
  respondedAt: null,
  createdAt: '2026-10-06T08:00:00.000Z',
});
const page = <T,>(data: T[]) =>
  jsonResponse({ data, meta: { page: 1, pageSize: 20, total: data.length } });

const recruiter = () =>
  sessionResponse({
    id: RECRUITER_ID,
    roles: ['RECRUITER'],
    permissions: [
      'jobs:read',
      'applications:read',
      'applications:transition',
      'interviews:write',
      'offers:read',
      'offers:write',
    ],
  });

describe('application page', () => {
  it('lets the hiring manager approve a pending offer, sending its version', async () => {
    let sent: unknown;
    mockApi({
      'POST /api/v1/auth/refresh': () =>
        sessionResponse({
          id: HM_ID,
          roles: ['HIRING_MANAGER'],
          permissions: [
            'jobs:read',
            'applications:read',
            'interview-feedback:write',
            'offers:read',
            'offers:approve',
          ],
        }),
      [`GET /api/v1/applications/${APP_ID}`]: () => jsonResponse(application('OFFER')),
      [`GET /api/v1/jobs/${JOB_ID}`]: () => jsonResponse(job),
      'GET /api/v1/offers': () => page([offer('PENDING_APPROVAL')]),
      'GET /api/v1/interviews': () => page([]),
      [`POST /api/v1/offers/${OFFER_ID}/approve`]: (init) => {
        sent = JSON.parse(String(init?.body));
        return jsonResponse(offer('APPROVED'));
      },
    });
    renderApp(`/applications/${APP_ID}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(sent).toEqual({ version: 3 }));
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    // Sending is the recruiter's step, not the approver's.
    expect(screen.queryByRole('button', { name: 'Mark as sent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hire' })).not.toBeInTheDocument();
  });

  it('shows Hire to the job recruiter once the offer is accepted', async () => {
    let sent: unknown;
    mockApi({
      'POST /api/v1/auth/refresh': () => recruiter(),
      [`GET /api/v1/applications/${APP_ID}`]: () => jsonResponse(application('OFFER')),
      [`GET /api/v1/jobs/${JOB_ID}`]: () => jsonResponse(job),
      'GET /api/v1/offers': () => page([offer('ACCEPTED')]),
      'GET /api/v1/interviews': () => page([]),
      [`POST /api/v1/applications/${APP_ID}/transition`]: (init) => {
        sent = JSON.parse(String(init?.body));
        return jsonResponse(application('HIRED'));
      },
    });
    renderApp(`/applications/${APP_ID}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Hire' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hire' }));
    await waitFor(() => expect(sent).toEqual({ to: 'HIRED', version: 5 }));
  });

  it('schedules in Dubai time and requires a location for on-site interviews', async () => {
    let sent: { scheduledAt?: string; interviewerIds?: string[] } | undefined;
    mockApi({
      'POST /api/v1/auth/refresh': () => recruiter(),
      [`GET /api/v1/applications/${APP_ID}`]: () => jsonResponse(application('INTERVIEW')),
      [`GET /api/v1/jobs/${JOB_ID}`]: () => jsonResponse(job),
      'GET /api/v1/offers': () => page([]),
      'GET /api/v1/interviews': () => page([]),
      'GET /api/v1/interviews/panel-options': () =>
        jsonResponse([{ id: HM_ID, name: 'Fatima Al Zaabi', role: 'Hiring Manager' }]),
      'POST /api/v1/interviews': (init) => {
        sent = JSON.parse(String(init?.body));
        return jsonResponse({}, 201);
      },
    });
    renderApp(`/applications/${APP_ID}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Schedule' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Date'), '2027-01-10');
    await userEvent.click(await within(dialog).findByLabelText(/Fatima Al Zaabi/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }));
    expect(
      await within(dialog).findByText('On-site interviews need a location.'),
    ).toBeInTheDocument();
    expect(sent).toBeUndefined();

    await userEvent.type(within(dialog).getByLabelText('Location'), 'Business Bay office');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }));
    await waitFor(() =>
      expect(sent).toMatchObject({
        scheduledAt: '2027-01-10T10:00:00+04:00',
        interviewerIds: [HM_ID],
      }),
    );
  });
});
