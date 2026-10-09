import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ClientRevenue,
  type Dashboard,
  FUNNEL_STAGES,
  type HiringFunnel,
  type OpenRequests,
  type ReportFilter,
  type TimeToHire,
  type Widget,
} from '@staffos/shared';
import { type Actor, hasRole } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { todayInDubai } from '../../common/errors/prisma-errors';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

type View = 'v_hiring_funnel' | 'v_time_to_hire' | 'v_client_revenue' | 'v_open_requests';
const HAS_RECRUITERS: View[] = ['v_hiring_funnel', 'v_time_to_hire'];

/** Roles that see every client in reports; others are scoped below (US-DASH-01). */
export const isGlobalReader = (actor: Actor) =>
  hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER', 'FINANCE');

/**
 * Data scope as a parameterised SQL fragment: account managers see their clients, recruiters the
 * jobs they are assigned to (funnel and time to hire only); anyone else sees nothing.
 */
export function viewScope(view: View, actor: Actor): Prisma.Sql {
  if (isGlobalReader(actor)) return Prisma.sql`TRUE`;
  const parts: Prisma.Sql[] = [];
  if (hasRole(actor, 'ACCOUNT_MANAGER'))
    parts.push(Prisma.sql`account_manager_id = ${actor.id}::uuid`);
  if (hasRole(actor, 'RECRUITER') && HAS_RECRUITERS.includes(view)) {
    parts.push(Prisma.sql`${actor.id}::uuid = ANY(recruiter_ids)`);
  }
  return parts.length ? Prisma.sql`(${Prisma.join(parts, ' OR ')})` : Prisma.sql`FALSE`;
}

/** Optional filters; `dateColumn` is a fixed column name per view, never user input. */
function filters(f: ReportFilter, dateColumn: string | null): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const col = dateColumn ? Prisma.raw(dateColumn) : null;
  if (col && f.from) parts.push(Prisma.sql`${col} >= ${f.from}::date`);
  if (col && f.to) parts.push(Prisma.sql`${col} < (${f.to}::date + 1)`);
  if (f.clientId) parts.push(Prisma.sql`client_id = ${f.clientId}::uuid`);
  // Only the recruitment views have a job_id column.
  if (f.jobId && (dateColumn === 'applied_at' || dateColumn === 'hired_at')) {
    parts.push(Prisma.sql`job_id = ${f.jobId}::uuid`);
  }
  return parts.length ? Prisma.sql`AND ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const daysAgo = (n: number) =>
  new Date(Date.parse(`${todayInDubai()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export type ReportTable = { title: string; columns: string[]; rows: (string | number | null)[][] };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async hiringFunnel(f: ReportFilter, actor: Actor): Promise<HiringFunnel> {
    const rows = await this.prisma.$queryRaw<{ stage: string; count: bigint }[]>`
      SELECT stage, COUNT(DISTINCT application_id) AS count FROM v_hiring_funnel
      WHERE ${viewScope('v_hiring_funnel', actor)} ${filters(f, 'applied_at')}
      GROUP BY stage`;
    const by = new Map(rows.map((r) => [r.stage, num(r.count)]));
    const stages = FUNNEL_STAGES.map((stage) => ({ stage, count: by.get(stage) ?? 0 }));
    const applied = stages[0]!.count;
    return { stages, conversion: applied ? (by.get('HIRED') ?? 0) / applied : null };
  }

  async timeToHire(f: ReportFilter, actor: Actor): Promise<TimeToHire> {
    const where = Prisma.sql`WHERE ${viewScope('v_time_to_hire', actor)} ${filters(f, 'hired_at')}`;
    const [totals] = await this.prisma.$queryRaw<
      { hires: bigint; avg: number | null; median: number | null }[]
    >`SELECT COUNT(*) AS hires, AVG(days_to_hire) AS avg,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY days_to_hire) AS median
      FROM v_time_to_hire ${where}`;
    const byCategory = await this.prisma.$queryRaw<
      { category: string; hires: bigint; avg: number }[]
    >`
      SELECT category, COUNT(*) AS hires, AVG(days_to_hire) AS avg FROM v_time_to_hire ${where}
      GROUP BY category ORDER BY hires DESC`;
    const byMonth = await this.prisma.$queryRaw<{ month: string; hires: bigint; avg: number }[]>`
      SELECT to_char(date_trunc('month', hired_at AT TIME ZONE 'Asia/Dubai'), 'YYYY-MM') AS month,
        COUNT(*) AS hires, AVG(days_to_hire) AS avg FROM v_time_to_hire ${where}
      GROUP BY 1 ORDER BY 1`;
    return {
      hires: num(totals?.hires),
      averageDays:
        totals?.avg === null || totals?.avg === undefined ? null : round1(num(totals.avg)),
      medianDays:
        totals?.median === null || totals?.median === undefined ? null : round1(num(totals.median)),
      byCategory: byCategory.map((r) => ({
        category: r.category,
        hires: num(r.hires),
        averageDays: round1(num(r.avg)),
      })),
      byMonth: byMonth.map((r) => ({
        month: r.month,
        hires: num(r.hires),
        averageDays: round1(num(r.avg)),
      })),
    };
  }

  async clientRevenue(f: ReportFilter, actor: Actor): Promise<ClientRevenue> {
    this.assertRevenueReader(actor);
    const where = Prisma.sql`WHERE ${viewScope('v_client_revenue', actor)} ${filters(f, 'issue_date')}`;
    const byClient = await this.prisma.$queryRaw<
      { client_id: string; client_name: string; invoices: bigint; total: bigint; paid: bigint }[]
    >`SELECT client_id, client_name, COUNT(*) AS invoices, SUM(total_fils) AS total,
        SUM(CASE WHEN status = 'PAID' THEN total_fils ELSE 0 END) AS paid
      FROM v_client_revenue ${where} GROUP BY client_id, client_name ORDER BY total DESC`;
    const byMonth = await this.prisma.$queryRaw<{ month: string; total: bigint }[]>`
      SELECT to_char(month, 'YYYY-MM') AS month, SUM(total_fils) AS total
      FROM v_client_revenue ${where} GROUP BY 1 ORDER BY 1`;
    const clients = byClient.map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name,
      invoices: num(r.invoices),
      totalFils: num(r.total),
      paidFils: num(r.paid),
      outstandingFils: num(r.total) - num(r.paid),
    }));
    const sum = (k: 'totalFils' | 'paidFils') => clients.reduce((s, c) => s + c[k], 0);
    return {
      totalFils: sum('totalFils'),
      paidFils: sum('paidFils'),
      outstandingFils: sum('totalFils') - sum('paidFils'),
      byClient: clients,
      byMonth: byMonth.map((r) => ({ month: r.month, totalFils: num(r.total) })),
    };
  }

  async openRequests(f: ReportFilter, actor: Actor, limit = 500): Promise<OpenRequests> {
    const where = Prisma.sql`WHERE ${viewScope('v_open_requests', actor)} ${filters(f, null)}`;
    const rows = await this.prisma.$queryRaw<
      {
        manpower_request_id: string;
        client_id: string;
        client_name: string;
        role_title: string;
        headcount: number;
        hired: number;
        status: string;
        age_days: number;
        start_date: Date;
      }[]
    >`SELECT * FROM v_open_requests ${where} ORDER BY age_days DESC, client_name LIMIT ${limit}`;
    const [counts] = await this.prisma.$queryRaw<{ total: bigint; old: bigint }[]>`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE age_days > 30) AS old FROM v_open_requests ${where}`;
    return {
      total: num(counts?.total),
      olderThan30Days: num(counts?.old),
      rows: rows.map((r) => ({
        manpowerRequestId: r.manpower_request_id,
        clientId: r.client_id,
        clientName: r.client_name,
        roleTitle: r.role_title,
        headcount: num(r.headcount),
        hired: num(r.hired),
        status: r.status,
        ageDays: num(r.age_days),
        startDate: r.start_date.toISOString().slice(0, 10),
      })),
    };
  }

  /** The same data as the screens, flattened for CSV/Excel/PDF (US-REP-01). */
  async table(name: string, f: ReportFilter, actor: Actor): Promise<ReportTable> {
    switch (name) {
      case 'hiring-funnel': {
        const r = await this.hiringFunnel(f, actor);
        return {
          title: 'Hiring funnel',
          columns: ['Stage', 'Applications'],
          rows: r.stages.map((s) => [s.stage, s.count]),
        };
      }
      case 'time-to-hire': {
        const r = await this.timeToHire(f, actor);
        return {
          title: 'Time to hire',
          columns: ['Month', 'Hires', 'Average days'],
          rows: r.byMonth.map((m) => [m.month, m.hires, m.averageDays]),
        };
      }
      case 'client-revenue': {
        const r = await this.clientRevenue(f, actor);
        const aed = (fils: number) => Number((fils / 100).toFixed(2));
        return {
          title: 'Client revenue (AED)',
          columns: ['Client', 'Invoices', 'Total', 'Paid', 'Outstanding'],
          rows: r.byClient.map((c) => [
            c.clientName,
            c.invoices,
            aed(c.totalFils),
            aed(c.paidFils),
            aed(c.outstandingFils),
          ]),
        };
      }
      case 'open-requests': {
        const r = await this.openRequests(f, actor);
        return {
          title: 'Open manpower requests',
          columns: ['Client', 'Role', 'Headcount', 'Hired', 'Status', 'Age (days)', 'Start date'],
          rows: r.rows.map((o) => [
            o.clientName,
            o.roleTitle,
            o.headcount,
            o.hired,
            o.status,
            o.ageDays,
            o.startDate,
          ]),
        };
      }
      default:
        throw new AppException(HttpStatus.NOT_FOUND, 'REPORT_NOT_FOUND', 'Report not found.');
    }
  }

  /** US-DASH-01: widgets for each of the caller's roles, merged for multi-role users. */
  async dashboard(actor: Actor): Promise<Dashboard> {
    const widgets = new Map<string, Widget>();
    const add = (w: Omit<Widget, 'hint' | 'link'> & { hint?: string; link?: string }) =>
      widgets.set(w.key, { hint: null, link: null, ...w });
    const last90 = { from: daysAgo(90) };
    const today = todayInDubai();
    const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000);
    const hr = hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER');
    const recruiter = hasRole(actor, 'RECRUITER');
    const am = hasRole(actor, 'ACCOUNT_MANAGER');
    const finance = hasRole(actor, 'SUPER_ADMIN', 'FINANCE');

    const myTasks = await this.prisma.task.count({
      where: {
        status: 'OPEN',
        OR: [{ assigneeId: actor.id }, { assigneeId: null, assigneeRole: { in: actor.roles } }],
      },
    });
    add({ key: 'tasks', label: 'My open tasks', value: myTasks, format: 'number', link: '/tasks' });

    let funnel: HiringFunnel | null = null;
    if (hr || recruiter) {
      funnel = await this.hiringFunnel(last90, actor);
      const tth = await this.timeToHire(last90, actor);
      add({ key: 'hires', label: 'Hires (90 days)', value: tth.hires, format: 'number' });
      if (tth.averageDays !== null) {
        add({
          key: 'tth',
          label: 'Average time to hire',
          value: tth.averageDays,
          format: 'days',
          hint: 'Last 90 days',
        });
      }
    }
    if (hr) {
      add({
        key: 'expiring',
        label: 'Documents expiring ≤ 30 days',
        value: await this.prisma.document.count({
          where: {
            deletedAt: null,
            employeeId: { not: null },
            expiryDate: { lte: in30 },
            employee: { status: { not: 'TERMINATED' } },
          },
        }),
        format: 'number',
        link: '/documents/expiring',
      });
      add({
        key: 'onboarding',
        label: 'Onboarding in progress',
        value: await this.prisma.onboardingPlan.count({ where: { status: 'IN_PROGRESS' } }),
        format: 'number',
        link: '/onboarding',
      });
    }
    if (recruiter) {
      const jobScope = {
        status: 'OPEN' as const,
        deletedAt: null,
        recruiters: { some: { userId: actor.id } },
      };
      add({
        key: 'myJobs',
        label: 'My open jobs',
        value: await this.prisma.job.count({ where: jobScope }),
        format: 'number',
        link: '/jobs',
      });
      add({
        key: 'pipeline',
        label: 'Active candidates in my jobs',
        value: await this.prisma.application.count({
          where: { job: jobScope, stage: { notIn: ['HIRED', 'REJECTED', 'WITHDRAWN'] } },
        }),
        format: 'number',
      });
    }
    let openRequests: OpenRequests['rows'] | null = null;
    if (hr || am) {
      const open = await this.openRequests({}, actor, 8);
      openRequests = open.rows;
      add({
        key: 'openRequests',
        label: 'Open manpower requests',
        value: open.total,
        format: 'number',
        link: '/requests',
      });
      add({
        key: 'oldRequests',
        label: 'Requests open > 30 days',
        value: open.olderThan30Days,
        format: 'number',
      });
    }
    if (am) {
      add({
        key: 'deployments',
        label: 'Active deployments (my clients)',
        value: await this.prisma.deployment.count({
          where: { status: 'ACTIVE', project: { client: { accountManagerId: actor.id } } },
        }),
        format: 'number',
        link: '/deployments',
      });
    }
    let revenueByMonth: ClientRevenue['byMonth'] | null = null;
    if (finance || am) {
      const revenue = await this.clientRevenue({ from: daysAgo(365) }, actor);
      revenueByMonth = revenue.byMonth;
      add({
        key: 'outstanding',
        label: 'Unpaid invoices',
        value: revenue.outstandingFils,
        format: 'money',
        link: '/invoices',
        hint: 'Issued, not yet paid',
      });
    }
    if (finance) {
      add({
        key: 'timesheets',
        label: 'Timesheets awaiting approval',
        value: await this.prisma.timesheet.count({ where: { status: 'SUBMITTED' } }),
        format: 'number',
        link: '/timesheets',
      });
    }
    return { widgets: [...widgets.values()], funnel, openRequests, revenueByMonth };
  }

  private assertRevenueReader(actor: Actor) {
    if (!isGlobalReader(actor) && !hasRole(actor, 'ACCOUNT_MANAGER')) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Revenue reports are for Finance and account managers.',
      );
    }
  }
}
