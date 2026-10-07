import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Permission } from '@staffos/shared';
import type { Actor } from './actor';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const AUTHENTICATED_ONLY_KEY = 'authenticatedOnly';

/**
 * Route requires an authenticated user holding ALL listed permissions (security.md §3).
 * Data scoping still happens in the service (security.md §4).
 */
export const RequirePermissions = (...permissions: [Permission, ...Permission[]]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing or invalid access token' }),
    ApiForbiddenResponse({ description: `Requires: ${permissions.join(', ')}` }),
  );

/** Route is open to any authenticated user (e.g. GET /auth/me); data is the caller's own. */
export const AuthenticatedOnly = () =>
  applyDecorators(
    SetMetadata(AUTHENTICATED_ONLY_KEY, true),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing or invalid access token' }),
  );

/** Injects the verified Actor (set by JwtAuthGuard). */
export const CurrentActor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Actor =>
    ctx.switchToHttp().getRequest<{ actor: Actor }>().actor,
);
