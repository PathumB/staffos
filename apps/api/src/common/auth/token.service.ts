import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, permissionsForRoles, RoleCode } from '@staffos/shared';
import { z } from 'zod';
import type { Env } from '../config/env';
import { AppException } from '../errors/app.exception';
import type { Actor } from './actor';

export const ACCESS_TOKEN_TTL_S = 15 * 60;
const ISSUER = 'staffos';
const AUDIENCE = 'staffos-api';

const accessPayloadSchema = z.object({
  sub: z.uuid(),
  roles: z.array(z.enum(Object.values(RoleCode) as [RoleCode, ...RoleCode[]])),
  cid: z.uuid().nullable(),
  eid: z.uuid().nullable(),
});

export type TokenSubject = {
  id: string;
  roles: RoleCode[];
  clientId: string | null;
  employeeId: string | null;
};

/** Access JWTs (HS256, 15 min) and opaque single-use tokens hashed with an HMAC key. */
@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly hashKey: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.hashKey = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  signAccessToken(subject: TokenSubject): string {
    return this.jwt.sign(
      { roles: subject.roles, cid: subject.clientId, eid: subject.employeeId },
      {
        secret: this.accessSecret,
        algorithm: 'HS256',
        expiresIn: ACCESS_TOKEN_TTL_S,
        subject: subject.id,
        issuer: ISSUER,
        audience: AUDIENCE,
        jwtid: randomUUID(),
      },
    );
  }

  async verifyAccessToken(token: string): Promise<Actor> {
    let raw: unknown;
    try {
      raw = await this.jwt.verifyAsync(token, {
        secret: this.accessSecret,
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
    } catch (error) {
      const expired = (error as Error).name === 'TokenExpiredError';
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        expired ? 'TOKEN_EXPIRED' : ErrorCode.UNAUTHENTICATED,
        expired ? 'Your session has expired.' : 'Authentication required.',
      );
    }
    const payload = accessPayloadSchema.safeParse(raw);
    if (!payload.success) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHENTICATED,
        'Authentication required.',
      );
    }
    const { sub, roles, cid, eid } = payload.data;
    return {
      id: sub,
      roles,
      permissions: new Set(permissionsForRoles(roles)),
      clientId: cid,
      employeeId: eid,
    };
  }

  /** 256-bit random token for cookies/links; only `hash` is stored. */
  createOpaqueToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHmac('sha256', this.hashKey).update(token).digest('hex');
  }
}
