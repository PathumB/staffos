import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, renderApp, sessionResponse } from '@/test/render';

const CANDIDATE_ID = '0199a1b2-0000-7000-8000-0000000000c7';

describe('create a candidate from a CV', () => {
  it('pre-fills the form as an AI-assisted suggestion, flags unsure fields and attaches the CV', async () => {
    let saved: Record<string, unknown> | undefined;
    mockApi({
      'POST /api/v1/auth/refresh': () =>
        sessionResponse({
          roles: ['RECRUITER'],
          permissions: ['candidates:read', 'candidates:write', 'ai:use'],
        }),
      'GET /api/v1/candidates': () =>
        jsonResponse({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      'POST /api/v1/ai/cv-parse': () =>
        jsonResponse({
          cvToken: 'signed.token',
          fileName: 'karim-cv.pdf',
          message: null,
          parsed: {
            firstName: { value: 'Karim', confidence: 0.98 },
            lastName: { value: 'Haddad', confidence: 0.97 },
            email: { value: 'karim@example.com', confidence: 0.99 },
            phone: { value: '+971 50 555 0101', confidence: 0.55 },
            currentTitle: { value: 'Forklift Operator', confidence: 0.9 },
            totalYearsExperience: { value: 6, confidence: 0.85 },
            skills: [{ name: 'Forklift licence', years: 6, confidence: 0.9 }],
            education: [],
            certifications: [],
            languages: ['English'],
          },
        }),
      'POST /api/v1/candidates': (init) => {
        saved = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            id: CANDIDATE_ID,
            firstName: 'Karim',
            lastName: 'Haddad',
            email: 'karim@example.com',
            phone: '+971 50 555 0101',
            location: null,
            currentTitle: 'Forklift Operator',
            totalExperienceMonths: 72,
            summary: null,
            nationality: null,
            languages: ['English'],
            skills: [{ name: 'Forklift licence', years: 6 }],
            source: 'CV_UPLOAD',
            applicationCount: 0,
            createdAt: '2026-10-08T10:00:00.000Z',
          },
          201,
        );
      },
      [`GET /api/v1/candidates/${CANDIDATE_ID}`]: () => jsonResponse({}, 404),
      'GET /api/v1/applications': () =>
        jsonResponse({ data: [], meta: { page: 1, pageSize: 50, total: 0 } }),
      'GET /api/v1/documents': () => jsonResponse([]),
    });
    renderApp('/candidates');

    await userEvent.click(await screen.findByRole('button', { name: 'From CV' }));
    const upload = await screen.findByRole('dialog');
    await userEvent.upload(
      within(upload).getByLabelText('CV file'),
      new File(['%PDF-1.7'], 'karim-cv.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(within(upload).getByRole('button', { name: 'Upload and read' }));

    const form = await screen.findByRole('dialog', { name: 'New candidate' });
    expect(within(form).getByRole('note')).toHaveTextContent('AI-assisted suggestion');
    expect(within(form).getByLabelText('First name')).toHaveValue('Karim');
    expect(within(form).getByLabelText('Experience (years)')).toHaveValue(6);
    // Phone came back with low confidence: highlighted for checking.
    expect(within(form).getByText(/AI was unsure about this/)).toBeInTheDocument();

    await userEvent.click(within(form).getByRole('button', { name: /Save|Create/ }));
    await waitFor(() =>
      expect(saved).toMatchObject({
        firstName: 'Karim',
        totalExperienceMonths: 72,
        cvToken: 'signed.token',
        skills: [{ name: 'Forklift licence', years: 6 }],
      }),
    );
  });
});
