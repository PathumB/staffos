import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Notification, NotificationListQuery, Paginated } from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Actor } from '../../common/auth/actor';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';
import { paginated } from '../../common/pagination/pagination';
import type { Prisma } from '../../generated/prisma/client';
import { JobsService } from '../../infra/jobs/jobs.service';
import { MailService } from '../../infra/mail/mail.service';
import { notificationEmail } from '../../infra/mail/templates';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  link?: string;
  /** Also email it (default true). Sent by the outbox job only after the transaction commits. */
  email?: boolean;
};

type Db = Pick<PrismaService, 'notification'> | Prisma.TransactionClient;

export const NOTIFICATION_EMAIL_JOB = 'notifications.email';
const EMAIL_BATCH = 50;
/** Older unsent rows are skipped: a stale "please approve" email helps nobody. */
const EMAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function toNotification(n: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): Notification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * In-app notifications (US-NOTIF-01). `notify` writes rows inside the caller's transaction, so a
 * notification exists only if the change it describes committed; emails go out from the same rows
 * via a scheduled outbox job, never from inside the transaction.
 */
@Injectable()
export class NotificationsService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    jobs: JobsService,
    config: ConfigService<Env, true>,
    @InjectPinoLogger(NotificationsService.name) private readonly logger: PinoLogger,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
    jobs.schedule(NOTIFICATION_EMAIL_JOB, '* * * * *', async () => {
      await this.sendPendingEmails();
    });
  }

  async notify(
    userIds: Iterable<string | null | undefined>,
    input: NotificationInput,
    db: Db = this.prisma,
  ): Promise<void> {
    const unique = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return;
    const { email = true, ...fields } = input;
    await db.notification.createMany({
      data: unique.map((userId) => ({ userId, ...fields, sendEmail: email })),
    });
  }

  async list(query: NotificationListQuery, actor: Actor): Promise<Paginated<Notification>> {
    const { page, pageSize } = query;
    const where: Prisma.NotificationWhereInput = {
      userId: actor.id,
      ...(query.unread === 'true' ? { readAt: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(rows.map(toNotification), total, { page, pageSize });
  }

  async unreadCount(actor: Actor): Promise<{ count: number }> {
    return {
      count: await this.prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
    };
  }

  /** Own notifications only: someone else's id is simply not found. */
  async markRead(id: string, actor: Actor): Promise<Notification> {
    await this.prisma.notification.updateMany({
      where: { id, userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({ where: { id, userId: actor.id } });
    if (!row) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'NOTIFICATION_NOT_FOUND',
        'Notification not found.',
      );
    }
    return toNotification(row);
  }

  async markAllRead(actor: Actor): Promise<{ count: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { count };
  }

  /**
   * Outbox sender (every minute). The mail job itself retries delivery.
   */
  async sendPendingEmails(now = new Date()): Promise<number> {
    // Claim a batch in one statement; SKIP LOCKED lets several API instances share the work
    // without ever emailing the same row twice. Fixed SQL, no user input.
    const since = new Date(now.getTime() - EMAIL_MAX_AGE_MS);
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE notifications SET emailed_at = ${now}
      WHERE id IN (
        SELECT id FROM notifications
        WHERE send_email AND emailed_at IS NULL AND created_at >= ${since}
        ORDER BY created_at
        LIMIT ${EMAIL_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    if (claimed.length === 0) return 0;
    const rows = await this.prisma.notification.findMany({
      where: { id: { in: claimed.map((r) => r.id) }, user: { status: 'ACTIVE' } },
      include: { user: { select: { email: true, firstName: true } } },
    });
    for (const n of rows) {
      try {
        await this.mail.send(
          notificationEmail(n.user.email, n.user.firstName, {
            title: n.title,
            body: n.body,
            url: n.link ? `${this.appUrl}${n.link}` : undefined,
          }),
        );
      } catch (err) {
        this.logger.warn({ err, notificationId: n.id }, 'Notification email not queued');
      }
    }
    // Rows claimed, including those skipped for inactive users, so callers can drain a backlog.
    return claimed.length;
  }
}
