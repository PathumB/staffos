import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type Permission } from '@staffos/shared';
import type { Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { requestContext } from '../context/request-context';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import type { Actor } from './actor';
import { AUTHENTICATED_ONLY_KEY, PERMISSIONS_KEY } from './decorators';
import { TokenService } from './token.service';

function isPublic(reflector: Reflector, ctx: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]) === true
  );
}

/** Global guard #1: verifies the bearer access token and attaches the Actor. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (isPublic(this.reflector, ctx)) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHENTICATED,
        'Authentication required.',
      );
    }
    const actor = await this.tokens.verifyAccessToken(token);
    req.actor = actor;
    requestContext.setActor(actor);
    return true;
  }
}

/**
 * Global guard #2: deny by default. A route must be @Public(), @AuthenticatedOnly() or carry
 * @RequirePermissions(...); anything else is a programming error and returns 403.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectPinoLogger(PermissionsGuard.name) private readonly logger: PinoLogger,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (isPublic(this.reflector, ctx)) {
      return true;
    }
    const targets = [ctx.getHandler(), ctx.getClass()];
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATED_ONLY_KEY,
      targets,
    );
    const actor = ctx.switchToHttp().getRequest<{ actor?: Actor }>().actor;

    if (!actor) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHENTICATED,
        'Authentication required.',
      );
    }
    if (required?.length) {
      if (required.every((p) => actor.permissions.has(p))) {
        return true;
      }
      this.logger.info({ actorId: actor.id, required }, 'PERMISSION_DENIED');
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'You do not have permission to perform this action.',
      );
    }
    if (authenticatedOnly) {
      return true;
    }
    this.logger.error({ handler: ctx.getHandler().name }, 'Route has no access policy');
    throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Access denied.');
  }
}
