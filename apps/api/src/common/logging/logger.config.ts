import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Reuses a well-formed incoming X-Request-Id (e.g. from a proxy) so traces join up across hops. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

export function loggerParams(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: resolveRequestId,
      customProps: (req) => ({ traceId: req.id }),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.token',
        ],
        censor: '[REDACTED]',
      },
      // UptimeRobot hits /health every 5 minutes; logging each ping is noise.
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
          : undefined,
    },
  };
}
