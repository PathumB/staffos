import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile (free CAPTCHA) for the public apply form (security.md §1). Without a
 * secret key (local dev, tests) verification is skipped; production logs a warning at startup.
 */
@Injectable()
export class CaptchaService {
  private readonly secret?: string;

  constructor(
    config: ConfigService<Env, true>,
    @InjectPinoLogger(CaptchaService.name) private readonly logger: PinoLogger,
  ) {
    this.secret = config.get('TURNSTILE_SECRET_KEY', { infer: true });
    if (!this.secret && config.get('NODE_ENV', { infer: true }) === 'production') {
      logger.warn('TURNSTILE_SECRET_KEY is not set: the careers apply form has no CAPTCHA.');
    }
  }

  async verify(token: string | undefined, ip: string | undefined): Promise<void> {
    if (!this.secret) return;
    let ok = false;
    if (token) {
      try {
        const res = await fetch(VERIFY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret: this.secret, response: token, remoteip: ip ?? '' }),
          signal: AbortSignal.timeout(5_000),
        });
        ok = ((await res.json()) as { success?: boolean }).success === true;
      } catch (err) {
        // Fail closed: if the CAPTCHA can't be checked, the public form can't be used to spam.
        this.logger.warn({ err }, 'Turnstile verification failed');
      }
    }
    if (!ok) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CAPTCHA_FAILED',
        'Please complete the check that you are not a robot, then try again.',
      );
    }
  }
}
