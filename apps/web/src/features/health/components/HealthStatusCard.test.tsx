import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '@/test/render';
import { HealthStatusCard } from './HealthStatusCard';

const healthy = { status: 'ok', version: '0.1.0', uptimeS: 12, checks: { db: 'ok' } };

describe('HealthStatusCard', () => {
  it('shows a loading state, then operational status and version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(healthy)));

    renderWithProviders(<HealthStatusCard />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking API…');
    expect(await screen.findByText('0.1.0')).toBeInTheDocument();
    expect(screen.getAllByText('Operational')).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith('/api/v1/health', expect.anything());
  });

  it('shows the database as unavailable when the API returns 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ...healthy, status: 'error', checks: { db: 'error' } }, 503),
        ),
    );

    renderWithProviders(<HealthStatusCard />);

    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Operational')).toBeInTheDocument();
  });

  it('shows an error with a working retry when the API is unreachable', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(healthy));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<HealthStatusCard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('API unreachable.');
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('0.1.0')).toBeInTheDocument();
  });

  it('shows the traceId from an API error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { code: 'INTERNAL_ERROR', message: 'Boom.', details: {}, traceId: 'trace-123' },
            500,
          ),
        ),
    );

    renderWithProviders(<HealthStatusCard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('trace trace-123');
  });
});
