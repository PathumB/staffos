import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type Feedback,
  type FeedbackInputData,
  INTERVIEW_MODE_LABELS,
  type Interview,
  type InterviewCreateData,
  type InterviewListQuery,
  type InterviewUpdateData,
  type Paginated,
  type PanelOption,
  type Permission,
  ROLE_PERMISSIONS,
  type RoleCode,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Actor } from '../../common/auth/actor';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';
import { personName } from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  applicationWriteScope,
  interviewReadScope,
  interviewWriteScope,
  isRecruitmentAdmin,
} from '../../common/scoping/recruitment-scope';
import type { Prisma } from '../../generated/prisma/client';
import { buildIcs, formatDubaiTime } from '../../infra/mail/ics';
import { MailService } from '../../infra/mail/mail.service';
import { interviewEmail } from '../../infra/mail/templates';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  assertFeedbackEditable,
  assertInFuture,
  assertInterviewScheduled,
  feedbackEditableUntil,
  icsSequence,
} from './interview.rules';

const FEEDBACK: Permission = 'interview-feedback:write';
/** Roles that can give feedback, so only they can sit on a panel. */
const PANEL_ROLES = (Object.keys(ROLE_PERMISSIONS) as RoleCode[]).filter((r) =>
  ROLE_PERMISSIONS[r].includes(FEEDBACK),
);

const person = { select: { id: true, firstName: true, lastName: true, email: true } } as const;
const include = {
  application: {
    select: {
      id: true,
      candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      job: {
        select: {
          id: true,
          title: true,
          hiringManagerId: true,
          recruiters: { select: { userId: true } },
        },
      },
    },
  },
  interviewers: { include: { user: person } },
  feedback: { select: { interviewerId: true } },
} satisfies Prisma.InterviewInclude;
type Row = Prisma.InterviewGetPayload<{ include: typeof include }>;

function toInterview(i: Row): Interview {
  const submitted = new Set(i.feedback.map((f) => f.interviewerId));
  const c = i.application.candidate;
  return {
    id: i.id,
    applicationId: i.application.id,
    scheduledAt: i.scheduledAt.toISOString(),
    durationMin: i.durationMin,
    mode: i.mode,
    location: i.location,
    meetingUrl: i.meetingUrl,
    status: i.status,
    candidate: { id: c.id, name: `${c.firstName} ${c.lastName}` },
    job: { id: i.application.job.id, title: i.application.job.title },
    interviewers: i.interviewers.map(({ user }) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      submitted: submitted.has(user.id),
    })),
    createdAt: i.createdAt.toISOString(),
  };
}

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'INTERVIEW_NOT_FOUND', 'Interview not found.');

type Kind = 'scheduled' | 'rescheduled' | 'cancelled';

@Injectable()
export class InterviewsService {
  private readonly appUrl: string;
  private readonly organizer: { name: string; email: string };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    @InjectPinoLogger(InterviewsService.name) private readonly logger: PinoLogger,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
    const from = config.get('MAIL_FROM', { infer: true });
    // "StaffOS <no-reply@…>" → name + address for the calendar ORGANIZER.
    const match = /^(.*?)\s*<([^>]+)>$/.exec(from);
    this.organizer = match
      ? { name: match[1] || 'StaffOS', email: match[2]! }
      : { name: 'StaffOS', email: from };
  }

  async list(query: InterviewListQuery, actor: Actor): Promise<Paginated<Interview>> {
    const f = query.filter ?? {};
    const where: Prisma.InterviewWhereInput = {
      AND: [
        interviewReadScope(actor),
        {
          applicationId: f.applicationId,
          status: f.status,
          ...(f.interviewerId ? { interviewers: { some: { userId: f.interviewerId } } } : {}),
        },
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.interview.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.interview.count({ where }),
    ]);
    return paginated(rows.map(toInterview), total, query);
  }

  /** Active users who may give feedback, for the scheduling form. */
  async panelOptions(): Promise<PanelOption[]> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: { in: PANEL_ROLES } } } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        roles: { select: { role: { select: { name: true, code: true } } } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
    });
    return users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      role: u.roles.find((r) => PANEL_ROLES.includes(r.role.code))?.role.name ?? '',
    }));
  }

  async get(id: string, actor: Actor): Promise<Interview> {
    return toInterview(await this.find(id, interviewReadScope(actor)));
  }

  /** US-INT-01: only for applications in INTERVIEW; invites go out after the commit. */
  async create(input: InterviewCreateData, actor: Actor): Promise<Interview> {
    const application = await this.prisma.application.findFirst({
      where: { AND: [{ id: input.applicationId }, applicationWriteScope(actor)] },
      select: { id: true, stage: true, candidate: { select: { deletedAt: true } } },
    });
    if (!application || application.candidate.deletedAt) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'APPLICATION_NOT_FOUND',
        'Application not found.',
      );
    }
    if (application.stage !== 'INTERVIEW') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'APPLICATION_NOT_IN_INTERVIEW',
        'Move the candidate to the Interview stage before scheduling.',
        { stage: application.stage },
      );
    }
    const scheduledAt = new Date(input.scheduledAt);
    assertInFuture(scheduledAt, new Date());
    await this.assertPanel(input.interviewerIds);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.interview.create({
        data: {
          applicationId: application.id,
          scheduledAt,
          durationMin: input.durationMin,
          mode: input.mode,
          location: input.location ?? null,
          meetingUrl: input.meetingUrl ?? null,
          createdById: actor.id,
          interviewers: { create: input.interviewerIds.map((userId) => ({ userId })) },
        },
        include,
      });
      await this.audit.record(
        { action: 'CREATE', entity: 'interview', entityId: row.id, after: snapshot(row) },
        tx,
      );
      return row;
    });
    await this.sendInvites(created, 'scheduled', created.interviewers);
    return toInterview(created);
  }

  /** Reschedule or change the panel; everyone gets an updated invite, removed people a cancel. */
  async update(id: string, input: InterviewUpdateData, actor: Actor): Promise<Interview> {
    const before = await this.find(id, interviewWriteScope(actor));
    assertInterviewScheduled(before.status);
    const scheduledAt = new Date(input.scheduledAt);
    assertInFuture(scheduledAt, new Date());
    await this.assertPanel(input.interviewerIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.interviewInterviewer.deleteMany({
        where: { interviewId: id, userId: { notIn: input.interviewerIds } },
      });
      const row = await tx.interview.update({
        where: { id },
        data: {
          scheduledAt,
          durationMin: input.durationMin,
          mode: input.mode,
          location: input.location ?? null,
          meetingUrl: input.meetingUrl ?? null,
          interviewers: {
            createMany: {
              data: input.interviewerIds.map((userId) => ({ userId })),
              skipDuplicates: true,
            },
          },
        },
        include,
      });
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'interview',
          entityId: id,
          before: snapshot(before),
          after: snapshot(row),
        },
        tx,
      );
      return row;
    });
    const kept = new Set(input.interviewerIds);
    const removed = before.interviewers.filter((i) => !kept.has(i.userId));
    await this.sendInvites(updated, 'rescheduled', updated.interviewers);
    if (removed.length) await this.sendInvites(updated, 'cancelled', removed, undefined, false);
    return toInterview(updated);
  }

  async cancel(id: string, reason: string, actor: Actor): Promise<Interview> {
    const before = await this.find(id, interviewWriteScope(actor));
    assertInterviewScheduled(before.status);
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const row = await tx.interview.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include,
      });
      await this.audit.record(
        {
          action: 'CANCEL',
          entity: 'interview',
          entityId: id,
          before: { status: before.status },
          after: { status: 'CANCELLED', reason },
        },
        tx,
      );
      return row;
    });
    await this.sendInvites(cancelled, 'cancelled', cancelled.interviewers, reason);
    return toInterview(cancelled);
  }

  /**
   * US-INT-03: panel members submit once and may edit for 24 hours. When the whole panel has
   * submitted, the interview is COMPLETED and the job's recruiters are notified.
   */
  async submitFeedback(id: string, input: FeedbackInputData, actor: Actor): Promise<Feedback> {
    const interview = await this.find(id, interviewReadScope(actor));
    if (!interview.interviewers.some((i) => i.userId === actor.id)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'NOT_AN_INTERVIEWER',
        'Only interviewers on this panel can submit feedback.',
      );
    }
    if (interview.status === 'CANCELLED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INTERVIEW_NOT_SCHEDULED',
        'This interview was cancelled.',
        { status: interview.status },
      );
    }
    const existing = await this.prisma.interviewFeedback.findUnique({
      where: { interviewId_interviewerId: { interviewId: id, interviewerId: actor.id } },
    });
    if (existing) assertFeedbackEditable(existing.submittedAt, new Date());

    const data = {
      scores: input.scores,
      recommendation: input.recommendation,
      notes: input.notes ?? null,
    };
    return this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.interviewFeedback.update({
            where: { id: existing.id },
            data,
            include: { interviewer: person },
          })
        : await tx.interviewFeedback.create({
            data: { interviewId: id, interviewerId: actor.id, ...data },
            include: { interviewer: person },
          });
      await this.audit.record(
        {
          action: existing ? 'UPDATE' : 'CREATE',
          entity: 'interview_feedback',
          entityId: saved.id,
          // Scores and recommendation are the decision trail; notes stay out of the audit copy.
          before: existing
            ? { scores: existing.scores, recommendation: existing.recommendation }
            : undefined,
          after: { interviewId: id, scores: input.scores, recommendation: input.recommendation },
        },
        tx,
      );
      if (!existing && interview.status === 'SCHEDULED') {
        // Count only the current panel: someone removed after scoring doesn't complete it.
        const submitted = await tx.interviewFeedback.count({
          where: {
            interviewId: id,
            interviewerId: { in: interview.interviewers.map((i) => i.userId) },
          },
        });
        if (submitted >= interview.interviewers.length) {
          await tx.interview.update({ where: { id }, data: { status: 'COMPLETED' } });
          const c = interview.application.candidate;
          await this.notifications.notify(
            interview.application.job.recruiters.map((r) => r.userId),
            {
              type: 'interview.feedback_complete',
              title: `Feedback complete: ${c.firstName} ${c.lastName}`,
              body: `All interviewers have scored the interview for ${interview.application.job.title}.`,
              link: `/applications/${interview.application.id}`,
            },
            tx,
          );
        }
      }
      return toFeedback(saved);
    });
  }

  /**
   * Admins, the job's recruiters and its hiring manager see every scorecard; other panel members
   * see only their own, so one interviewer's opinion doesn't anchor the next.
   */
  async listFeedback(id: string, actor: Actor): Promise<Feedback[]> {
    const interview = await this.find(id, interviewReadScope(actor));
    const job = interview.application.job;
    const seesAll =
      isRecruitmentAdmin(actor) ||
      job.hiringManagerId === actor.id ||
      job.recruiters.some((r) => r.userId === actor.id);
    const rows = await this.prisma.interviewFeedback.findMany({
      where: { interviewId: id, ...(seesAll ? {} : { interviewerId: actor.id }) },
      include: { interviewer: person },
      orderBy: { submittedAt: 'asc' },
    });
    return rows.map(toFeedback);
  }

  private async find(id: string, scope: Prisma.InterviewWhereInput): Promise<Row> {
    const row = await this.prisma.interview.findFirst({
      where: { AND: [{ id, application: { candidate: { deletedAt: null } } }, scope] },
      include,
    });
    if (!row) throw notFound();
    return row;
  }

  private async assertPanel(ids: string[]): Promise<void> {
    const found = await this.prisma.user.count({
      where: {
        id: { in: ids },
        status: 'ACTIVE',
        roles: { some: { role: { code: { in: PANEL_ROLES } } } },
      },
    });
    if (found !== ids.length) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_INTERVIEWER',
        'Interviewers must be active hiring managers or HR staff.',
      );
    }
  }

  /**
   * One email per person, each with an invite that lists only that person, so the candidate
   * never sees staff addresses. Queueing failures are logged and never undo the change (§7).
   */
  private async sendInvites(
    interview: Row,
    kind: Kind,
    panel: Row['interviewers'],
    reason?: string,
    includeCandidate = true,
  ): Promise<void> {
    const c = interview.application.candidate;
    const candidateName = `${c.firstName} ${c.lastName}`;
    const jobTitle = interview.application.job.title;
    const recipients = [
      ...(includeCandidate
        ? [
            {
              audience: 'candidate' as const,
              email: c.email,
              firstName: c.firstName,
              lastName: c.lastName,
            },
          ]
        : []),
      ...panel.map(({ user }) => ({ audience: 'interviewer' as const, ...user })),
    ];
    const sequence = icsSequence(interview.createdAt, new Date());
    for (const r of recipients) {
      const ics = buildIcs({
        uid: `${interview.id}@staffos`,
        sequence,
        method: kind === 'cancelled' ? 'CANCEL' : 'REQUEST',
        start: interview.scheduledAt,
        durationMin: interview.durationMin,
        summary:
          r.audience === 'candidate'
            ? `Interview: ${jobTitle}`
            : `Interview: ${candidateName} (${jobTitle})`,
        description: interview.meetingUrl ? `Join: ${interview.meetingUrl}` : 'StaffOS interview',
        location: interview.location ?? interview.meetingUrl,
        organizer: this.organizer,
        attendee: { name: `${r.firstName} ${r.lastName}`, email: r.email },
      });
      try {
        await this.mail.send(
          interviewEmail({
            to: r.email,
            firstName: r.firstName,
            audience: r.audience,
            kind,
            jobTitle,
            candidateName,
            when: formatDubaiTime(interview.scheduledAt),
            mode: INTERVIEW_MODE_LABELS[interview.mode],
            location: interview.location,
            meetingUrl: interview.meetingUrl,
            reason,
            link: `${this.appUrl}/applications/${interview.application.id}`,
            ics,
          }),
        );
      } catch (error) {
        this.logger.warn({ err: error, interviewId: interview.id }, 'Interview email not queued');
      }
    }
  }
}

function snapshot(i: Row) {
  return {
    applicationId: i.application.id,
    scheduledAt: i.scheduledAt.toISOString(),
    durationMin: i.durationMin,
    mode: i.mode,
    location: i.location,
    interviewerIds: i.interviewers.map((x) => x.userId),
  };
}

function toFeedback(
  f: Prisma.InterviewFeedbackGetPayload<{ include: { interviewer: typeof person } }>,
): Feedback {
  return {
    id: f.id,
    interviewer: personName(f.interviewer)!,
    scores: f.scores as Feedback['scores'],
    recommendation: f.recommendation,
    notes: f.notes,
    submittedAt: f.submittedAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    editableUntil: feedbackEditableUntil(f.submittedAt).toISOString(),
  };
}
