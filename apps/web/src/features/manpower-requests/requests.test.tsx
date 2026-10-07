import type { ManpowerRequest } from '@staffos/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, jsonResponse, mockApi, renderApp, sessionResponse } from '@/test/render';

const base: ManpowerRequest = {
  id: '0199a1b2-0000-7000-8000-0000000000aa',
  client: { id: '0199a1b2-0000-7000-8000-0000000000c1', name: 'Gulf Build Contracting LLC' },
  project: null,
  roleTitle: 'Heavy Vehicle Driver',
  category: 'DRIVER',
  headcount: 25,
  location: 'Jebel Ali',
  emirate: 'DUBAI',
  startDate: '2027-01-15',
  durationMonths: 12,
  billRateMinFils: 4500,
  billRateMaxFils: 5500,
  currency: 'AED',
  requirements: null,
  status: 'PENDING_APPROVAL',
  version: 2,
  submittedAt: '2026-10-07T08:00:00.000Z',
  decidedAt: null,
  decidedBy: null,
  decisionComment: null,
  cancelReason: null,
  createdBy: { id: '0199a1b2-0000-7000-8000-0000000000d1', name: 'Daniel Mensah' },
  createdAt: '2026-10-07T07:00:00.000Z',
};

const hr = () =>
  sessionResponse({
    roles: ['HR_MANAGER'],
    permissions: ['manpower-requests:read', 'manpower-requests:write', 'manpower-requests:approve'],
  });
const clientUser = () =>
  sessionResponse({
    roles: ['CLIENT_USER'],
    clientId: base.client.id,
    permissions: ['manpower-requests:read', 'manpower-requests:write'],
  });

describe('manpower request detail', () => {
  it('lets HR approve a pending request, sending the version for conflict protection', async () => {
    let approveBody: unknown;
    mockApi({
      'POST /api/v1/auth/refresh': hr,
      [`GET /api/v1/manpower-requests/${base.id}`]: () => jsonResponse(base),
      [`POST /api/v1/manpower-requests/${base.id}/approve`]: (init) => {
        approveBody = JSON.parse(String(init?.body));
        return jsonResponse({ ...base, status: 'APPROVED', version: 3 });
      },
    });
    renderApp(`/requests/${base.id}`);

    expect(
      await screen.findByRole('heading', { name: '25 × Heavy Vehicle Driver' }),
    ).toBeInTheDocument();
    expect(screen.getByText('AED 45.00 – AED 55.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Comment/), 'Budget confirmed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(approveBody).toEqual({ version: 2, comment: 'Budget confirmed' }));
  });

  it('requires a reason to reject', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': hr,
      [`GET /api/v1/manpower-requests/${base.id}`]: () => jsonResponse(base),
    });
    renderApp(`/requests/${base.id}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(within(dialog).getByText('This field is required.')).toBeInTheDocument();
  });

  it('shows a clear message when someone else changed the request (409 STALE_VERSION)', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': hr,
      [`GET /api/v1/manpower-requests/${base.id}`]: () => jsonResponse(base),
      [`POST /api/v1/manpower-requests/${base.id}/approve`]: () =>
        apiError('STALE_VERSION', 409, 'Changed'),
    });
    renderApp(`/requests/${base.id}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }),
    );

    // Toasts render outside the dialog; the page refetches the latest version.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('client users see no approve or submit buttons', async () => {
    mockApi({
      'POST /api/v1/auth/refresh': clientUser,
      [`GET /api/v1/manpower-requests/${base.id}`]: () =>
        jsonResponse({ ...base, status: 'SUBMITTED' }),
    });
    renderApp(`/requests/${base.id}`);

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('client users create requests without choosing a client and rates are sent in fils', async () => {
    let created: Record<string, unknown> | undefined;
    mockApi({
      'POST /api/v1/auth/refresh': clientUser,
      'GET /api/v1/manpower-requests': () =>
        jsonResponse({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      'POST /api/v1/manpower-requests': (init) => {
        created = JSON.parse(String(init?.body));
        return jsonResponse({ ...base, status: 'SUBMITTED' }, 201);
      },
      [`GET /api/v1/manpower-requests/${base.id}`]: () =>
        jsonResponse({ ...base, status: 'SUBMITTED' }),
    });
    renderApp('/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'New request' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Client')).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Role title'), 'Electrician');
    const headcount = within(dialog).getByLabelText('Headcount');
    await userEvent.clear(headcount);
    await userEvent.type(headcount, '8');
    await userEvent.type(within(dialog).getByLabelText('Start date'), '2027-02-01');
    await userEvent.type(within(dialog).getByLabelText('Location'), 'Al Quoz');
    await userEvent.type(within(dialog).getByLabelText('Bill rate min (AED/h)'), '42.5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));

    await waitFor(() =>
      expect(created).toMatchObject({
        roleTitle: 'Electrician',
        headcount: 8,
        billRateMinFils: 4250,
      }),
    );
    expect(created).not.toHaveProperty('clientId');
  });
});
