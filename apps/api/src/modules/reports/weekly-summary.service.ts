import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Actor } from '../../common/auth/actor';
import type { Env } from '../../common/config/env';
import { todayInDubai } from '../../common/errors/prisma-errors';
import { JobsService } from '../../infra/jobs/jobs.service';
import { MailService } from '../../infra/mail/mail.service';
import { notificationEmail } from '../../infra/mail/templates';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toPdf } from './report-export';
import { ReportsService } from './reports.service';

export const WEEKLY_SUMMARY_JOB = 'reports.weekly-summary';

/** Management (Super Admins) see every client, so the summary is built with a global scope. */
const MANAGEMENT: Actor = {
  id: '00000000-0000-0000-0000-000000000000',
  roles: ['SUPER_ADMIN'],
  permissions: new Set(),
  clientId: null,
  employeeId: null,
};

/** US-REP-01: Monday 08:00 Asia/Dubai (04:00 UTC) summary email with a PDF to management. */
@Injectable()
export class WeeklySummaryService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
    @InjectPinoLogger(WeeklySummaryService.name) private readonly logger: PinoLogger,
    jobs: JobsService,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
    jobs.schedule(WEEKLY_SUMMARY_JOB, '0 4 * * 1', async () => {
      await this.send();
    });
  }

  async send(): Promise<number> {
    const today = todayInDubai();
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const week = { from, to: today };
    const [funnel, tth, revenue, open] = await Promise.all([
      this.reports.hiringFunnel(week, MANAGEMENT),
      this.reports.timeToHire(week, MANAGEMENT),
      this.reports.clientRevenue(week, MANAGEMENT),
      this.reports.openRequests({}, MANAGEMENT),
    ]);
    const aed = (fils: number) =>
      `AED ${(fils / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const pdf = await toPdf(
      {
        title: 'StaffOS weekly summary',
        columns: ['Measure', 'Value'],
        rows: [
          ['Applications (7 days)', funnel.stages[0]!.count],
          ['Hires (7 days)', tth.hires],
          ['Average time to hire (days)', tth.averageDays],
          ['Invoiced (7 days)', aed(revenue.totalFils)],
          ['Open manpower requests', open.total],
          ['Requests open > 30 days', open.olderThan30Days],
        ],
      },
      `Week ${from} to ${today} (Asia/Dubai)`,
    );
    const managers = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: 'SUPER_ADMIN' } } } },
      select: { email: true, firstName: true },
    });
    for (const m of managers) {
      await this.mail.send({
        ...notificationEmail(m.email, m.firstName, {
          title: `Weekly summary: ${tth.hires} hires, ${open.total} open requests`,
          body: `Applications: ${funnel.stages[0]!.count}. Invoiced: ${aed(revenue.totalFils)}. The PDF is attached.`,
          url: `${this.appUrl}/reports`,
        }),
        attachments: [
          {
            filename: `staffos-weekly-${today}.pdf`,
            content: pdf.toString('base64'),
            encoding: 'base64',
            contentType: 'application/pdf',
          },
        ],
      });
    }
    this.logger.info({ recipients: managers.length }, 'Weekly summary sent');
    return managers.length;
  }
}
