import * as argon2 from 'argon2';

/** OWASP minimum for argon2id (security.md §2). Shared by PasswordService and the seed. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;
