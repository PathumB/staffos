import type { Candidate, Document } from '@staffos/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderApp, sessionResponse } from '@/test/render';

const CAND_ID = '0199a1b2-0000-7000-8000-00000000002b';
const DOC_ID = '0199a1b2-0000-7000-8000-0000000000d1';

const candidate: Candidate = {
  id: CAND_ID,
  firstName: 'Rania',
  lastName: 'Saeed',
  email: 'rania@example.test',
  phone: null,
  nationality: null,
  location: 'Dubai',
  currentTitle: 'Warehouse Operator',
  totalExperienceMonths: 48,
  summary: null,
  source: 'MANUAL',
  languages: [],
  skills: [],
  applicationCount: 0,
  createdAt: '2026-10-01T08:00:00.000Z',
};

const cv: Document = {
  id: DOC_ID,
  ownerType: 'CANDIDATE',
  ownerId: CAND_ID,
  type: 'CV',
  fileName: 'rania-cv.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 120_000,
  number: null,
  issueDate: null,
  expiryDate: null,
  expiryStatus: null,
  uploadedBy: null,
  createdAt: '2026-10-01T08:00:00.000Z',
};

const recruiter = () =>
  sessionResponse({
    roles: ['RECRUITER'],
    permissions: ['candidates:read', 'candidates:write', 'documents:read', 'documents:write'],
  });

describe('documents panel', () => {
  it('offers recruiters no identity document types and downloads through a signed link', async () => {
    let urlRequested = false;
    mockApi({
      'POST /api/v1/auth/refresh': () => recruiter(),
      [`GET /api/v1/candidates/${CAND_ID}`]: () => jsonResponse(candidate),
      'GET /api/v1/documents': () => jsonResponse([cv]),
      [`GET /api/v1/documents/${DOC_ID}/url`]: () => {
        urlRequested = true;
        return jsonResponse({
          url: '/api/v1/files/abc.def',
          expiresAt: '2026-10-08T10:05:00.000Z',
        });
      },
    });
    renderApp(`/candidates/${CAND_ID}`);

    const download = await screen.findByRole('button', { name: 'Download CV' });
    // Stubbed only now: the app reads the real location while starting up.
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await userEvent.click(download);
    await waitFor(() => expect(urlRequested).toBe(true));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/api/v1/files/abc.def'));

    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    const dialog = await screen.findByRole('dialog');
    const options = within(within(dialog).getByLabelText('Type'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toContain('CV');
    expect(options).not.toContain('Passport');
    expect(options).not.toContain('Emirates ID');
    vi.unstubAllGlobals();
  });
});
