import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  acceptInvitationSchema,
  ErrorCode,
  loginResponseSchema,
  loginSchema,
  type LoginResponse,
  type Me,
  meSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@staffos/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { Actor } from '../../common/auth/actor';
import { AuthenticatedOnly, CurrentActor } from '../../common/auth/decorators';
import type { Env } from '../../common/config/env';
import { Public } from '../../common/decorators/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { ApiZodBody, ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { AuthService, REFRESH_TOKEN_TTL_MS, type Session } from './auth.service';

class LoginDto extends createZodDto(loginSchema) {}
class PasswordResetRequestDto extends createZodDto(passwordResetRequestSchema) {}
class PasswordResetConfirmDto extends createZodDto(passwordResetConfirmSchema) {}
class AcceptInvitationDto extends createZodDto(acceptInvitationSchema) {}

export const REFRESH_COOKIE = 'sr_rt';
const COOKIE_PATH = '/api/v1/auth';
const MINUTE = 60_000;
/**
 * Login attempts per IP per minute (security.md §2: 10). Overridable only so the E2E suite, which
 * signs in many times from one machine, isn't throttled; production keeps the default.
 */
const loginLimit = () => Number(process.env.LOGIN_RATE_LIMIT_PER_MIN) || 10;
/** Session refreshes per IP per minute (one per page load). Same override rule as login. */
const refreshLimit = () => Number(process.env.REFRESH_RATE_LIMIT_PER_MIN) || 30;

/**
 * Thin HTTP layer: cookies and status codes only; rules live in AuthService.
 * Refresh token: httpOnly, SameSite=Strict cookie scoped to /api/v1/auth (security.md §2).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieBase: CookieOptions;
  private readonly allowedOrigins: string[];

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieBase = {
      httpOnly: true,
      sameSite: 'strict',
      path: COOKIE_PATH,
      // Browsers accept Secure cookies on http://localhost; supertest needs them plain.
      secure: config.get('NODE_ENV', { infer: true }) !== 'test',
    };
    this.allowedOrigins = config.get('CORS_ORIGINS', { infer: true });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: loginLimit, ttl: MINUTE } })
  @ApiOperation({ summary: 'Sign in; sets the refresh cookie' })
  @ApiZodBody(loginSchema)
  @ApiZodOkResponse(loginResponseSchema)
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED or ACCOUNT_LOCKED' })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.respond(res, await this.auth.login(body, this.clientInfo(req)));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: refreshLimit, ttl: MINUTE } })
  @ApiOperation({ summary: 'Rotate the refresh cookie and get a new access token' })
  @ApiZodOkResponse(loginResponseSchema)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    this.assertSameOrigin(req);
    try {
      return this.respond(res, await this.auth.refresh(this.readCookie(req), this.clientInfo(req)));
    } catch (error) {
      // Keep the cookie for a rotation race (the client retries); clear it otherwise.
      if (!(error instanceof AppException && error.code === 'TOKEN_ROTATED')) {
        res.clearCookie(REFRESH_COOKIE, this.cookieBase);
      }
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh token and clear the cookie' })
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertSameOrigin(req);
    await this.auth.logout(this.readCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieBase);
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60 * MINUTE } })
  @ApiOperation({ summary: 'Email a reset link (always 202 — no account enumeration)' })
  @ApiZodBody(passwordResetRequestSchema)
  async requestPasswordReset(@Body() body: PasswordResetRequestDto): Promise<void> {
    await this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60 * MINUTE } })
  @ApiOperation({ summary: 'Set a new password with a reset token; ends all sessions' })
  @ApiZodBody(passwordResetConfirmSchema)
  async confirmPasswordReset(@Body() body: PasswordResetConfirmDto): Promise<void> {
    await this.auth.confirmPasswordReset(body.token, body.newPassword);
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60 * MINUTE } })
  @ApiOperation({ summary: 'Activate an invited account by choosing a password' })
  @ApiZodBody(acceptInvitationSchema)
  async acceptInvitation(@Body() body: AcceptInvitationDto): Promise<void> {
    await this.auth.acceptInvitation(body.token, body.password);
  }

  @Get('me')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'The signed-in user with roles and permissions' })
  @ApiZodOkResponse(meSchema)
  me(@CurrentActor() actor: Actor): Promise<Me> {
    return this.auth.me(actor);
  }

  private respond(res: Response, session: Session): LoginResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieBase,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
  }

  private readCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  /** CSRF defence for the cookie-authenticated endpoints (security.md §5.1). */
  private assertSameOrigin(req: Request): void {
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins.includes(origin)) {
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Origin not allowed.');
    }
  }

  private clientInfo(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
