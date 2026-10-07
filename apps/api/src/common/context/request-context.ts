import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Actor } from '../auth/actor';

export type RequestContext = {
  traceId?: string;
  ip?: string;
  userAgent?: string;
  /** Set by JwtAuthGuard once the access token is verified. */
  actor?: Actor;
};

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Per-request context (trace id, client IP, user agent, actor) available anywhere in the call
 * chain — used by AuditService so services don't have to pass HTTP details around.
 */
export const requestContext = {
  get(): RequestContext {
    return storage.getStore() ?? {};
  },
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },
  setActor(actor: Actor): void {
    const store = storage.getStore();
    if (store) store.actor = actor;
  },
};

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { id?: unknown }, res: Response, next: NextFunction): void {
    const header = res.getHeader('X-Request-Id');
    const traceId =
      typeof req.id === 'string' ? req.id : typeof header === 'string' ? header : undefined;
    storage.run({ traceId, ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300) }, () =>
      next(),
    );
  }
}
