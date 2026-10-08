import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';

export type CvDraft = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  aiResultId: string | null;
  exp: number;
};

const TTL_SECONDS = 24 * 60 * 60;

/**
 * Signed, stateless reference to a CV uploaded for parsing. The recruiter's browser carries it
 * from "upload CV" to "save candidate"; the HMAC stops anyone pointing it at another file.
 */
@Injectable()
export class CvDraftService {
  private readonly secret: string;

  constructor(config: ConfigService<Env, true>) {
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  sign(draft: Omit<CvDraft, 'exp'>): string {
    const payload = Buffer.from(
      JSON.stringify({ ...draft, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }),
    ).toString('base64url');
    return `${payload}.${this.mac(payload)}`;
  }

  /** Valid, unexpired, and uploaded by this user, or 400 INVALID_CV_TOKEN. */
  verify(token: string, userId: string): CvDraft {
    const [payload, mac] = token.split('.');
    const bad = () =>
      new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_CV_TOKEN',
        'The uploaded CV has expired. Upload it again.',
      );
    if (!payload || !mac) throw bad();
    const expected = Buffer.from(this.mac(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw bad();
    const draft = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CvDraft;
    if (draft.exp < Math.floor(Date.now() / 1000) || draft.uploadedById !== userId) throw bad();
    return draft;
  }

  private mac(payload: string): string {
    return createHmac('sha256', this.secret).update(`cv-draft:${payload}`).digest('base64url');
  }
}
