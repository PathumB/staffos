import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Candidate,
  CandidateCreateData,
  CandidateListQuery,
  CandidateUpdateData,
  Paginated,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  candidateReadScope,
  candidateWriteScope,
  isRecruitmentAdmin,
  masksCandidateContact,
} from '../../common/scoping/recruitment-scope';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CvDraftService } from '../ai/cv-draft.service';
import { AuditService } from '../audit/audit.service';

const include = {
  skills: { orderBy: { name: 'asc' } },
  _count: { select: { applications: true } },
} satisfies Prisma.CandidateInclude;
type Row = Prisma.CandidateGetPayload<{ include: typeof include }>;

/** "rania@example.com" → "r•••@example.com". */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

function toCandidate(c: Row, mask: boolean): Candidate {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: mask ? maskEmail(c.email) : c.email,
    phone: mask ? null : c.phone,
    location: c.location,
    currentTitle: c.currentTitle,
    totalExperienceMonths: c.totalExperienceMonths,
    summary: c.summary,
    nationality: mask ? null : c.nationality,
    languages: c.languages,
    skills: c.skills.map((s) => ({ name: s.name, years: s.years })),
    source: c.source,
    applicationCount: c._count.applications,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Audit snapshot without contact details (the audit log is not a second PII store). */
const snapshot = (c: Candidate) => ({
  name: `${c.firstName} ${c.lastName}`,
  currentTitle: c.currentTitle,
  totalExperienceMonths: c.totalExperienceMonths,
  skills: c.skills.map((s) => s.name),
});

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'CANDIDATE_NOT_FOUND', 'Candidate not found.');

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cvDrafts: CvDraftService,
  ) {}

  async list(query: CandidateListQuery, actor: Actor): Promise<Paginated<Candidate>> {
    const where: Prisma.CandidateWhereInput = {
      AND: [
        candidateReadScope(actor),
        { deletedAt: null, source: query.filter?.source },
        query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                { currentTitle: { contains: query.search, mode: 'insensitive' } },
                { skills: { some: { name: { contains: query.search, mode: 'insensitive' } } } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.candidate.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.candidate.count({ where }),
    ]);
    const mask = masksCandidateContact(actor);
    return paginated(
      rows.map((c) => toCandidate(c, mask)),
      total,
      query,
    );
  }

  async get(id: string, actor: Actor): Promise<Candidate> {
    return toCandidate(
      await this.find(id, candidateReadScope(actor)),
      masksCandidateContact(actor),
    );
  }

  /**
   * Same email or phone as an existing candidate → 409 CANDIDATE_DUPLICATE with the existing id,
   * unless an HR Manager / Super Admin deliberately forces it (US-CAND-02).
   */
  async create(input: CandidateCreateData, force: boolean, actor: Actor): Promise<Candidate> {
    const duplicate = await this.prisma.candidate.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])],
      },
      select: { id: true },
    });
    if (duplicate && !(force && isRecruitmentAdmin(actor))) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CANDIDATE_DUPLICATE',
        'A candidate with this email or phone already exists.',
        {
          // Only reveal which record when the caller may open it.
          candidateId: (await this.isVisible(duplicate.id, actor)) ? duplicate.id : undefined,
        },
      );
    }
    const { skills, cvToken, ...fields } = input;
    // From POST /ai/cv-parse: attach the uploaded CV and link the AI suggestion (US-CAND-01).
    const cv = cvToken ? this.cvDrafts.verify(cvToken, actor.id) : null;
    return this.prisma.$transaction(async (tx) => {
      const created = toCandidate(
        await tx.candidate.create({
          data: {
            ...fields,
            ...(cv ? { source: 'CV_UPLOAD' as const } : {}),
            createdById: actor.id,
            skills: { create: skills.map((s) => ({ name: s.name, years: s.years })) },
          },
          include,
        }),
        false,
      );
      if (cv) {
        await tx.document.create({
          data: {
            candidateId: created.id,
            type: 'CV',
            fileName: cv.fileName,
            storageKey: cv.storageKey,
            mimeType: cv.mimeType,
            sizeBytes: cv.sizeBytes,
            createdById: actor.id,
          },
        });
        if (cv.aiResultId) {
          await tx.aiResult.updateMany({
            where: { id: cv.aiResultId, confirmedAt: null },
            data: { confirmedAt: new Date(), entityType: 'candidate', entityId: created.id },
          });
        }
      }
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'candidate',
          entityId: created.id,
          after: { ...snapshot(created), fromCv: Boolean(cv), aiAssisted: Boolean(cv?.aiResultId) },
        },
        tx,
      );
      return created;
    });
  }

  async update(id: string, input: CandidateUpdateData, actor: Actor): Promise<Candidate> {
    const before = toCandidate(await this.find(id, candidateWriteScope(actor)), false);
    const { skills, ...fields } = input;
    return this.prisma.$transaction(async (tx) => {
      await tx.candidate.update({ where: { id }, data: fields });
      if (skills) {
        await tx.candidateSkill.deleteMany({ where: { candidateId: id } });
        await tx.candidateSkill.createMany({
          data: skills.map((s) => ({ candidateId: id, name: s.name, years: s.years })),
        });
      }
      const after = toCandidate(
        await tx.candidate.findUniqueOrThrow({ where: { id }, include }),
        false,
      );
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'candidate',
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
  }

  /** Soft delete, HR Managers only; applications and stage history stay for reporting. */
  async remove(id: string, actor: Actor): Promise<void> {
    if (!isRecruitmentAdmin(actor)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Only HR Managers can delete candidates.',
      );
    }
    const candidate = toCandidate(await this.find(id, {}), false);
    await this.prisma.$transaction(async (tx) => {
      await tx.candidate.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        { action: 'DELETE', entity: 'candidate', entityId: id, before: snapshot(candidate) },
        tx,
      );
    });
  }

  private async find(id: string, scope: Prisma.CandidateWhereInput): Promise<Row> {
    const row = await this.prisma.candidate.findFirst({
      where: { AND: [{ id, deletedAt: null }, scope] },
      include,
    });
    if (!row) throw notFound();
    return row;
  }

  private async isVisible(id: string, actor: Actor): Promise<boolean> {
    return (
      (await this.prisma.candidate.count({ where: { AND: [{ id }, candidateReadScope(actor)] } })) >
      0
    );
  }
}
