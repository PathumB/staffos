import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { passwordSchema } from '@staffos/shared';
import * as argon2 from 'argon2';
import { validationFailed } from '../../common/validation/validation.pipe';
import { ARGON2_OPTIONS } from './argon2.options';

let commonPasswords: Set<string> | undefined;
function isCommon(password: string): boolean {
  commonPasswords ??= new Set(
    readFileSync(join(__dirname, 'data', 'common-passwords.txt'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  );
  return commonPasswords.has(password.toLowerCase());
}

@Injectable()
export class PasswordService {
  // Verifying against a real hash when the user doesn't exist keeps response times similar,
  // so login timing doesn't reveal which emails have accounts.
  private readonly dummyHash = argon2.hash('staffos-timing-equaliser', ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async dummyVerify(password: string): Promise<void> {
    await this.verify(await this.dummyHash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  /** Length rules (shared schema) + common-password and personal-info checks (NIST 800-63B). */
  assertAcceptable(
    password: string,
    field: string,
    user: { email: string; firstName: string; lastName: string },
  ): void {
    const length = passwordSchema.safeParse(password);
    if (!length.success) {
      throw validationFailed({ [field]: length.error.issues.map((i) => i.message) });
    }
    const lower = password.toLowerCase();
    const personal = [user.email.split('@')[0], user.firstName, user.lastName]
      .map((s) => s?.toLowerCase())
      .filter((s): s is string => Boolean(s && s.length >= 4));
    if (isCommon(password) || personal.some((s) => lower.includes(s))) {
      throw validationFailed({
        [field]: [
          'This password is too easy to guess. Avoid common passwords and your own name or email.',
        ],
      });
    }
  }
}
