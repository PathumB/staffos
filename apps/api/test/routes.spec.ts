import { RequestMethod } from '@nestjs/common';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AUTHENTICATED_ONLY_KEY, PERMISSIONS_KEY } from '../src/common/auth/decorators';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { createTestApp } from './utils/create-test-app';

// Nest's route metadata keys (from @nestjs/common/constants).
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

/** The only routes allowed without authentication (docs/security.md §3.2). */
const PUBLIC_ROUTES = new Set([
  'GET health',
  'POST auth/login',
  'POST auth/refresh',
  'POST auth/logout',
  'POST auth/password-reset/request',
  'POST auth/password-reset/confirm',
  'POST auth/invitations/accept',
  // Signed, 5-minute download links for the local storage provider: the URL is the credential.
  'GET files/:token',
]);

/** security.md §11: fails if any route lacks an access policy or is unexpectedly public. */
describe('route access policies', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ prisma: { $queryRaw: jest.fn() } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('every route is @Public (whitelisted), @AuthenticatedOnly or @RequirePermissions', () => {
    const reflector = app.get(Reflector);
    const scanner = new MetadataScanner();
    const routes: { route: string; policy: string }[] = [];

    const controllers = [...app.get(ModulesContainer).values()].flatMap((m) => [
      ...m.controllers.values(),
    ]);
    for (const wrapper of controllers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const prefix = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '').replace(/^\//, '');
      for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        const handler = instance[name as keyof typeof instance] as unknown as object;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const route = `${method} ${[prefix, path.replace(/^\//, '')].filter(Boolean).join('/')}`;
        const targets = [handler as () => void, metatype];
        const policy = reflector.getAllAndOverride(IS_PUBLIC_KEY, targets)
          ? 'public'
          : reflector.getAllAndOverride(PERMISSIONS_KEY, targets)?.length
            ? 'permissions'
            : reflector.getAllAndOverride(AUTHENTICATED_ONLY_KEY, targets)
              ? 'authenticated'
              : 'NONE';
        routes.push({ route, policy });
      }
    }

    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => r.policy === 'NONE')).toEqual([]);
    expect(routes.filter((r) => r.policy === 'public' && !PUBLIC_ROUTES.has(r.route))).toEqual([]);
  });
});
