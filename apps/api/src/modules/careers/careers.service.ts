import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ApplyData,
  type ApplyResponse,
  type DataRequestInput,
  type Paginated,
  type PublicJob,
  type PublicJobQuery,
  publicStatus,
  type Tracking,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { TokenService } from '../../common/auth/token.service';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import { paginated } from '../../common/pagination/pagination';
import type { Prisma } from '../../generated/prisma/client';
import { MailService } from '../../infra/mail/mail.service';
import { applicationReceivedEmail } from '../../infra/mail/templates';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { detectFileKind, sanitizeFileName, type UploadedFile } from '../documents/document.rules';
import { NotificationsService } from '../notifications/notifications.service';
import { CaptchaService } from './captcha.service';

const publicSelect = {
  slug: true,
  title: true,
  description: true,
  location: true,
  emirate: true,
  category: true,
  headcount: true,
  salaryMinFils: true,
  salaryMaxFils: true,
  currency: true,
  showClientName: true,
  publishedAt: true,
  client: { select: { name: true } },
  skills: { select: { name: true, weight: true }, orderBy: { name: 'asc' } },
} satisfies Prisma.JobSelect;
type PublicRow = Prisma.JobGetPayload<{ select: typeof publicSelect }>;

function toPublicJob(j: PublicRow): PublicJob {
  return {
    slug: j.slug,
    title: j.title,
    description: j.description,
    location: j.location,
    emirate: j.emirate,
    category: j.category,
    headcount: j.headcount,
    salaryMinFils: j.salaryMinFils,
    salaryMaxFils: j.salaryMaxFils,
    currency: j.currency,
    clientName: j.showClientName ? j.client.name : null,
    skills: j.skills.map((s) => ({ name: s.name, required: s.weight === 'MUST' })),
    publishedAt: j.publishedAt?.toISOString() ?? null,
  };
}

const openJob = { status: 'OPEN', deletedAt: null } as const;
const jobNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'This job is no longer open.');
const trackingNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'APPLICATION_NOT_FOUND', 'Application not found.');

/**
 * Public careers portal (US-CAREERS-01..03). No session: every endpoint returns only public
 * fields, and the tracking token is the candidate's only key (stored hashed).
 */
@Injectable()
export class CareersService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly captcha: CaptchaService,
    @InjectPinoLogger(CareersService.name) private readonly logger: PinoLogger,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  async listJobs(query: PublicJobQuery): Promise<Paginated<PublicJob>> {
    const search = query.search?.trim();
    const where: Prisma.JobWhereInput = {
      ...openJob,
      emirate: query.emirate,
      category: query.category,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { location: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        select: publicSelect,
        orderBy: { publishedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.job.count({ where }),
    ]);
    return paginated(rows.map(toPublicJob), total, query);
  }

  async getJob(slug: string): Promise<PublicJob> {
    const job = await this.prisma.job.findFirst({
      where: { slug, ...openJob },
      select: publicSelect,
    });
    if (!job) throw jobNotFound();
    return toPublicJob(job);
  }

  /**
   * US-CAREERS-02: dedupes the candidate by email, creates the application (APPLIED) with its
   * first history row, stores the CV privately, then emails the tracking link.
   */
  async apply(
    slug: string,
    input: ApplyData,
    file: UploadedFile | undefined,
    ip: string | undefined,
  ): Promise<ApplyResponse> {
    await this.captcha.verify(input.turnstileToken, ip);
    const job = await this.prisma.job.findFirst({
      where: { slug, ...openJob },
      select: { id: true, title: true, recruiters: { select: { userId: true } } },
    });
    if (!job) throw jobNotFound();
    const kind = detectFileKind(file);
    if (kind.ext !== 'pdf' && kind.ext !== 'docx') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_FILE',
        'Please upload your CV as a PDF or Word (.docx) file.',
      );
    }

    const email = input.email.toLowerCase();
    const existing = await this.prisma.candidate.findFirst({
      where: { email, deletedAt: null, anonymisedAt: null },
      select: { id: true, phone: true },
    });
    if (existing) {
      const dup = await this.prisma.application.count({
        where: { candidateId: existing.id, jobId: job.id },
      });
      if (dup) throw alreadyApplied();
    }

    const { token, hash } = this.tokens.createOpaqueToken();
    const now = new Date();

    // Set once the CV is in storage, so a failed transaction can remove it again.
    let storedKey: string | null = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        const candidate = existing
          ? await tx.candidate.update({
              where: { id: existing.id },
              data: { consentAt: now, ...(existing.phone ? {} : { phone: input.phone }) },
              select: { id: true },
            })
          : await tx.candidate.create({
              data: {
                firstName: input.firstName,
                lastName: input.lastName,
                email,
                phone: input.phone,
                summary: input.coverNote ?? null,
                source: 'CAREERS_PORTAL',
                consentAt: now,
              },
              select: { id: true },
            });
        const key = `candidate/${candidate.id}/${randomUUID()}.${kind.ext}`;
        await this.storage.provider.put(key, file!.buffer, kind.mimeType);
        storedKey = key;
        await tx.document.create({
          data: {
            candidateId: candidate.id,
            type: 'CV',
            fileName: sanitizeFileName(file!.originalname, kind.ext),
            storageKey: key,
            mimeType: kind.mimeType,
            sizeBytes: file!.size,
          },
        });
        const application = await tx.application.create({
          data: {
            candidateId: candidate.id,
            jobId: job.id,
            trackingTokenHash: hash,
            stageHistory: { create: { toStage: 'APPLIED', reason: 'Applied via careers portal' } },
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            action: 'APPLY',
            entity: 'application',
            entityId: application.id,
            actorId: null,
            after: { jobId: job.id, candidateId: candidate.id, source: 'CAREERS_PORTAL' },
          },
          tx,
        );
        await this.notifications.notify(
          job.recruiters.map((r) => r.userId),
          {
            type: 'application.received',
            title: `New application: ${input.firstName} ${input.lastName}`,
            body: job.title,
            link: `/applications/${application.id}`,
            email: false,
          },
          tx,
        );
      });
    } catch (error) {
      if (storedKey) await this.storage.provider.delete(storedKey).catch(() => undefined);
      if (isUniqueViolation(error)) throw alreadyApplied();
      throw error;
    }

    const trackingUrl = `${this.appUrl}/careers/track/${token}`;
    try {
      await this.mail.send(
        applicationReceivedEmail(email, input.firstName, job.title, trackingUrl),
      );
    } catch (err) {
      this.logger.warn({ err }, 'Application confirmation email not queued');
    }
    return {
      message: `Thank you, ${input.firstName}. We have received your application for ${job.title}.`,
      trackingUrl,
    };
  }

  /** US-CAREERS-03: only a candidate-friendly status, never internal stages or notes. */
  async track(token: string): Promise<Tracking> {
    const app = await this.findByToken(token);
    return {
      jobTitle: app.job.title,
      appliedAt: app.appliedAt.toISOString(),
      publicStatus: publicStatus(
        app.stage,
        app.job.status === 'OPEN' || app.job.status === 'ON_HOLD',
      ),
    };
  }

  /** Export/delete request from the tracking link: recorded, audited and given to HR as a task. */
  async dataRequest(token: string, input: DataRequestInput): Promise<void> {
    const app = await this.findByToken(token);
    const hr = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: 'HR_MANAGER' } } } },
      select: { id: true },
    });
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.dataSubjectRequest.create({
        data: { candidateId: app.candidateId, type: input.type },
      });
      const what = input.type === 'DELETE' ? 'Delete the data of' : 'Send a copy of the data to';
      await tx.task.create({
        data: {
          title: `${what} a candidate (data request)`,
          description: `Requested from the careers tracking link for "${app.job.title}". Respond within 30 days.`,
          assigneeRole: 'HR_MANAGER',
          dueDate: new Date(Date.now() + 30 * 86_400_000),
          entityType: 'data_subject_request',
          entityId: request.id,
        },
      });
      await this.audit.record(
        {
          action: `DATA_REQUEST_${input.type}`,
          entity: 'candidate',
          entityId: app.candidateId,
          actorId: null,
          after: { requestId: request.id },
        },
        tx,
      );
      await this.notifications.notify(
        hr.map((u) => u.id),
        {
          type: 'candidate.data_request',
          title: `Candidate data request (${input.type.toLowerCase()})`,
          body: 'A candidate asked about their personal data. A task has been created.',
          link: `/candidates/${app.candidateId}`,
        },
        tx,
      );
    });
  }

  private async findByToken(token: string) {
    // Malformed tokens never reach the database.
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) throw trackingNotFound();
    const app = await this.prisma.application.findUnique({
      where: { trackingTokenHash: this.tokens.hashToken(token) },
      select: {
        candidateId: true,
        stage: true,
        appliedAt: true,
        job: { select: { title: true, status: true } },
        candidate: { select: { deletedAt: true, anonymisedAt: true } },
      },
    });
    if (!app || app.candidate.deletedAt || app.candidate.anonymisedAt) throw trackingNotFound();
    return app;
  }
}

const alreadyApplied = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'ALREADY_APPLIED',
    'You have already applied for this job. Use the link in your confirmation email to track it.',
  );
