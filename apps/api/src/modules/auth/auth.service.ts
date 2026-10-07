import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ErrorCode,
  type LoginInput,
  type Me,
  permissionsForRoles,
  type RoleCode,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { ACCESS_TOKEN_TTL_S, TokenService } from '../../common/auth/token.service';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { MailService } from '../../infra/mail/mail.service';
import { invitationEmail, passwordResetEmail } from '../../infra/mail/templates';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
/**
 * A just-rotated refresh token presented again within this window is treated as a race
 * (two tabs refreshing at once — cookies are shared), not theft: the client retries with the
 * new cookie instead of the whole session being revoked.
 */
const ROTATION_GRACE_MS = 15_000;

const userWithAccess = {
  roles: { include: { role: true } },
  employee: { select: { id: true } },
} satisfies Prisma.UserInclude;
type UserWithAccess = Prisma.UserGetPayload<{ include: typeof userWithAccess }>;

export type Session = { accessToken: string; refreshToken: string; expiresIn: number; user: Me };
export type ClientInfo = { ip?: string; userAgent?: string };

function toMe(user: UserWithAccess): Me {
  const roles = user.roles.map((r) => r.role.code as RoleCode);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles,
    permissions: permissionsForRoles(roles),
    clientId: user.clientId,
    employeeId: user.employee?.id ?? null,
  };
}

const unauthorized = (code: string, message: string) =>
  new AppException(HttpStatus.UNAUTHORIZED, code, message);
const invalidCredentials = () =>
  unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect.');
const invalidToken = () =>
  new AppException(HttpStatus.BAD_REQUEST, 'TOKEN_INVALID', 'This link is invalid or has expired.');

@Injectable()
export class AuthService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  async login(input: LoginInput, client: ClientInfo): Promise<Session> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: userWithAccess,
    });
    if (!user?.passwordHash || user.status !== 'ACTIVE') {
      await this.passwords.dummyVerify(input.password);
      throw invalidCredentials();
    }
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw this.locked(user.lockedUntil);
    }

    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      // Atomic increment so concurrent failures can't slip past the threshold.
      const { failedLoginCount } = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      if (failedLoginCount >= LOCKOUT_THRESHOLD) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil, failedLoginCount: 0 },
        });
        await this.audit.record({
          action: 'ACCOUNT_LOCKED',
          entity: 'user',
          entityId: user.id,
          actorId: user.id,
        });
        throw this.locked(lockedUntil);
      }
      await this.audit.record({
        action: 'LOGIN_FAILED',
        entity: 'user',
        entityId: user.id,
        actorId: user.id,
      });
      throw invalidCredentials();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        // Transparently upgrade hashes when the argon2 parameters change.
        ...(this.passwords.needsRehash(user.passwordHash)
          ? { passwordHash: await this.passwords.hash(input.password) }
          : {}),
      },
    });
    await this.audit.record({
      action: 'LOGIN',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
    });
    return this.issueSession(user, randomUUID(), client);
  }

  async refresh(rawToken: string | undefined, client: ClientInfo): Promise<Session> {
    if (!rawToken) {
      throw unauthorized(ErrorCode.UNAUTHENTICATED, 'Authentication required.');
    }
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashToken(rawToken) },
      include: { user: { include: userWithAccess } },
    });
    if (!current) {
      throw unauthorized(ErrorCode.UNAUTHENTICATED, 'Authentication required.');
    }
    const now = Date.now();

    if (current.revokedAt) {
      if (current.replacedById && now - current.revokedAt.getTime() < ROTATION_GRACE_MS) {
        throw unauthorized('TOKEN_ROTATED', 'Session was refreshed elsewhere; retry.');
      }
      // A revoked token came back: assume theft and end every session in this family.
      await this.revokeFamily(current.familyId);
      await this.audit.record({
        action: 'REFRESH_TOKEN_REUSE',
        entity: 'user',
        entityId: current.userId,
        actorId: current.userId,
      });
      throw unauthorized('TOKEN_REUSED', 'Your session has ended. Please sign in again.');
    }
    if (current.expiresAt.getTime() <= now) {
      throw unauthorized('TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    if (current.user.status !== 'ACTIVE') {
      await this.revokeFamily(current.familyId);
      throw unauthorized(ErrorCode.UNAUTHENTICATED, 'Authentication required.');
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await this.issueSession(current.user, current.familyId, client, tx);
      const next = await tx.refreshToken.findUniqueOrThrow({
        where: { tokenHash: this.tokens.hashToken(session.refreshToken) },
        select: { id: true },
      });
      // Conditional update: if another request rotated this token first, abort (count = 0).
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: next.id },
      });
      if (count === 0) {
        throw unauthorized('TOKEN_ROTATED', 'Session was refreshed elsewhere; retry.');
      }
      return session;
    });
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashToken(rawToken) },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!token || token.revokedAt) return;
    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      action: 'LOGOUT',
      entity: 'user',
      entityId: token.userId,
      actorId: token.userId,
    });
  }

  async me(actor: Actor): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: userWithAccess,
    });
    if (!user || user.status !== 'ACTIVE') {
      throw unauthorized(ErrorCode.UNAUTHENTICATED, 'Authentication required.');
    }
    return toMe(user);
  }

  /** Always succeeds from the caller's view, so it can't be used to discover accounts. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return;
    const { token, hash } = this.tokens.createOpaqueToken();
    await this.prisma.$transaction([
      // Only the newest link works.
      this.prisma.authToken.updateMany({
        where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId: user.id,
          type: 'PASSWORD_RESET',
          tokenHash: hash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);
    await this.audit.record({
      action: 'PASSWORD_RESET_REQUESTED',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
    });
    await this.mail.send(
      passwordResetEmail(user.email, user.firstName, this.link('/reset-password', token)),
    );
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const authToken = await this.findValidToken(token, 'PASSWORD_RESET');
    if (authToken.user.status !== 'ACTIVE') throw invalidToken();
    this.passwords.assertAcceptable(newPassword, 'newPassword', authToken.user);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await this.consumeToken(tx, authToken.id);
      await tx.user.update({
        where: { id: authToken.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      // A reset ends every existing session.
      await tx.refreshToken.updateMany({
        where: { userId: authToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'PASSWORD_RESET',
          entity: 'user',
          entityId: authToken.userId,
          actorId: authToken.userId,
        },
        tx,
      );
    });
  }

  async acceptInvitation(token: string, password: string): Promise<void> {
    const authToken = await this.findValidToken(token, 'INVITATION');
    if (authToken.user.status !== 'INVITED') throw invalidToken();
    this.passwords.assertAcceptable(password, 'password', authToken.user);
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await this.consumeToken(tx, authToken.id);
      await tx.user.update({
        where: { id: authToken.userId },
        data: { passwordHash, passwordChangedAt: new Date(), status: 'ACTIVE' },
      });
      await this.audit.record(
        {
          action: 'INVITATION_ACCEPTED',
          entity: 'user',
          entityId: authToken.userId,
          actorId: authToken.userId,
          before: { status: 'INVITED' },
          after: { status: 'ACTIVE' },
        },
        tx,
      );
    });
  }

  /** Creates a fresh invitation (older ones stop working) and emails it. */
  async sendInvitation(user: { id: string; email: string; firstName: string }): Promise<void> {
    const { token, hash } = this.tokens.createOpaqueToken();
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId: user.id, type: 'INVITATION', usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId: user.id,
          type: 'INVITATION',
          tokenHash: hash,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      }),
    ]);
    await this.mail.send(
      invitationEmail(user.email, user.firstName, this.link('/accept-invite', token)),
    );
  }

  async revokeAllSessions(
    userId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    user: UserWithAccess,
    familyId: string,
    client: ClientInfo,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Session> {
    const me = toMe(user);
    const { token, hash } = this.tokens.createOpaqueToken();
    await db.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        createdByIp: client.ip ?? null,
        userAgent: client.userAgent?.slice(0, 300) ?? null,
      },
    });
    return {
      accessToken: this.tokens.signAccessToken({
        id: me.id,
        roles: me.roles,
        clientId: me.clientId,
        employeeId: me.employeeId,
      }),
      refreshToken: token,
      expiresIn: ACCESS_TOKEN_TTL_S,
      user: me,
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async findValidToken(token: string, type: 'PASSWORD_RESET' | 'INVITATION') {
    const authToken = await this.prisma.authToken.findUnique({
      where: { tokenHash: this.tokens.hashToken(token) },
      include: { user: true },
    });
    if (
      !authToken ||
      authToken.type !== type ||
      authToken.usedAt ||
      authToken.expiresAt <= new Date()
    ) {
      throw invalidToken();
    }
    return authToken;
  }

  /** Marks a single-use token used; the condition makes a double submit fail instead of racing. */
  private async consumeToken(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const { count } = await tx.authToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw invalidToken();
  }

  private locked(until: Date): AppException {
    return new AppException(
      HttpStatus.TOO_MANY_REQUESTS,
      'ACCOUNT_LOCKED',
      'Too many failed attempts. Try again later.',
      { retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)) },
    );
  }

  private link(path: string, token: string): string {
    return `${this.appUrl.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`;
  }
}
