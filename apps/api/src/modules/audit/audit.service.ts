import { Injectable } from '@nestjs/common';
import type { AuditLog, AuditLogListQuery, Paginated } from '@staffos/shared';
import { requestContext } from '../../common/context/request-context';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Defaults to the request's actor; pass explicitly for system jobs or pre-auth events. */
  actorId?: string | null;
};

const SENSITIVE_KEY = /(password|token|secret|hash)/i;

/** Removes secrets and normalises values so before/after are safe to store and show. */
export function redact(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v)]),
    );
  }
  return value;
}

type Db = Pick<PrismaService, 'auditLog'> | Prisma.TransactionClient;

/** Every create/update/delete and sensitive read goes through here (CLAUDE.md §7). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass the transaction client when the change happens inside a transaction. */
  async record(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    const ctx = requestContext.get();
    await db.auditLog.create({
      data: {
        actorId: entry.actorId !== undefined ? entry.actorId : (ctx.actor?.id ?? null),
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before:
          entry.before === undefined ? undefined : (redact(entry.before) as Prisma.InputJsonValue),
        after:
          entry.after === undefined ? undefined : (redact(entry.after) as Prisma.InputJsonValue),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        traceId: ctx.traceId ?? null,
      },
    });
  }

  async list(query: AuditLogListQuery): Promise<Paginated<AuditLog>> {
    const f = query.filter ?? {};
    const where: Prisma.AuditLogWhereInput = {
      actorId: f.actorId,
      entity: f.entity,
      entityId: f.entityId,
      action: f.action,
      createdAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' } },
              { entity: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actor: r.actor
          ? {
              id: r.actor.id,
              name: `${r.actor.firstName} ${r.actor.lastName}`,
              email: r.actor.email,
            }
          : null,
        before: r.before,
        after: r.after,
        ip: r.ip,
        userAgent: r.userAgent,
        traceId: r.traceId,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }
}
