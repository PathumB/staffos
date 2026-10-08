import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type NotificationInput = { type: string; title: string; body?: string; link?: string };

type Db = Pick<PrismaService, 'notification'> | Prisma.TransactionClient;

/**
 * In-app notifications. Writes rows only; the bell/inbox UI and email digests come with the
 * notifications module. Pass the transaction client so a notification exists only if the change
 * it describes was committed.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(
    userIds: Iterable<string | null | undefined>,
    input: NotificationInput,
    db: Db = this.prisma,
  ): Promise<void> {
    const unique = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return;
    await db.notification.createMany({
      data: unique.map((userId) => ({ userId, ...input })),
    });
  }
}
