import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { DB_CHECK_TIMEOUT_MS, HealthService } from './health.service';

function createService(queryRaw: jest.Mock) {
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const logger = { warn: jest.fn() } as unknown as PinoLogger;
  return { service: new HealthService(prisma, logger), logger };
}

describe('HealthService', () => {
  afterEach(() => jest.useRealTimers());

  it('reports ok when the database answers', async () => {
    const { service } = createService(jest.fn().mockResolvedValue([{ '?column?': 1 }]));

    const result = await service.check();

    expect(result).toMatchObject({ status: 'ok', checks: { db: 'ok' } });
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Number.isInteger(result.uptimeS)).toBe(true);
  });

  it('reports error and logs when the database query fails', async () => {
    const { service, logger } = createService(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    const result = await service.check();

    expect(result).toMatchObject({ status: 'error', checks: { db: 'error' } });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('reports error when the database does not answer in time', async () => {
    jest.useFakeTimers();
    const { service } = createService(jest.fn().mockReturnValue(new Promise(() => undefined)));

    const pending = service.check();
    await jest.advanceTimersByTimeAsync(DB_CHECK_TIMEOUT_MS);

    await expect(pending).resolves.toMatchObject({ status: 'error' });
  });
});
