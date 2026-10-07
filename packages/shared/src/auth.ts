import { z } from 'zod';
import { RoleCode, UserStatus } from './enums.js';
import { pageQuery, sortSchema } from './pagination.js';
import { PERMISSIONS } from './permissions.js';

// Shared by the API (request validation) and the web forms, so both reject the same input.
// Objects are strict: unknown fields are rejected (CLAUDE.md §7).

// Trim and lower-case before validating, so " Admin@X.com " is accepted and stored normalised.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.').max(254));

/** NIST 800-63B style: length only; the API also rejects common passwords (security.md §2). */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use at most 128 characters.');

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1, 'Enter your password.').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.strictObject({ email });

export const passwordResetConfirmSchema = z.strictObject({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});

export const acceptInvitationSchema = z.strictObject({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

const roleCode = z.enum(Object.values(RoleCode) as [RoleCode, ...RoleCode[]]);
const userStatus = z.enum(Object.values(UserStatus) as [UserStatus, ...UserStatus[]]);
const name = z.string().trim().min(1, 'Required.').max(100);

export const meSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  roles: z.array(roleCode),
  permissions: z.array(z.enum(PERMISSIONS)),
  clientId: z.uuid().nullable(),
  employeeId: z.uuid().nullable(),
});
export type Me = z.infer<typeof meSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: meSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshResponseSchema = loginResponseSchema;

// ── User administration ──

const rolesField = z
  .array(roleCode)
  .min(1, 'Select at least one role.')
  .refine((roles) => new Set(roles).size === roles.length, 'Roles must be unique.')
  .refine(
    (roles) => !roles.includes('CLIENT_USER') || roles.length === 1,
    'Client users cannot have other roles.',
  );

export const createUserSchema = z
  .strictObject({
    email,
    firstName: name,
    lastName: name,
    roles: rolesField,
    clientId: z.uuid().optional(),
  })
  .refine((u) => u.roles.includes('CLIENT_USER') === Boolean(u.clientId), {
    message: 'A client is required for client users, and only for them.',
    path: ['clientId'],
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.strictObject({
  firstName: name.optional(),
  lastName: name.optional(),
  roles: rolesField.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  status: userStatus,
  roles: z.array(roleCode),
  client: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const roleSchema = z.object({
  code: roleCode,
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.array(z.string()),
  userCount: z.number().int(),
});
export type Role = z.infer<typeof roleSchema>;

// ── Audit log ──

export const auditLogSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  actor: z.object({ id: z.uuid(), name: z.string(), email: z.string() }).nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  traceId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

// ── List queries ──

export const userListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt', 'email', 'lastName', 'lastLoginAt'], '-createdAt'),
  filter: z.strictObject({ status: userStatus.optional(), role: roleCode.optional() }).optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const auditLogListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt'], '-createdAt'),
  filter: z
    .strictObject({
      actorId: z.uuid().optional(),
      entity: z.string().max(60).optional(),
      entityId: z.string().max(60).optional(),
      action: z.string().max(60).optional(),
      from: z.iso.datetime({ offset: true }).optional(),
      to: z.iso.datetime({ offset: true }).optional(),
    })
    .optional(),
});
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
