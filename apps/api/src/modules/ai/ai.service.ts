import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AiRequest,
  type AiRequestListQuery,
  type AiUsage,
  type CvParseResponse,
  interviewKitSchema,
  type InterviewKit,
  interviewSummarySchema,
  type InterviewSummary,
  jdLlmSchema,
  type JdDraftResponse,
  matchLlmSchema,
  type MatchResult,
  type Paginated,
  parsedCvSchema,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { personName, userNameSelect } from '../../common/errors/prisma-errors';
import { paginated } from '../../common/pagination/pagination';
import {
  applicationReadScope,
  interviewReadScope,
  jobReadScope,
} from '../../common/scoping/recruitment-scope';
import type { Prisma } from '../../generated/prisma/client';
import { LlmService, untrusted } from '../../infra/llm/llm.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { detectFileKind, sanitizeFileName, type UploadedFile } from '../documents/document.rules';
import { anonymisedProfile, finalScore, inclusiveLanguageFlags, preScore } from './ai.rules';
import { CvDraftService } from './cv-draft.service';
import { extractCvText } from './cv-text';

const MATCH_PROMPT = 'match.v1';
const MATCH_LIMIT = 50;
/** Below this many characters the PDF is probably a scan: nothing useful to send. */
const MIN_CV_TEXT = 80;

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly storage: StorageService,
    private readonly drafts: CvDraftService,
    @InjectPinoLogger(AiService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * US-CAND-01: stores the CV privately, extracts its text and asks for a structured profile.
   * Whatever happens with AI, the recruiter gets a token to attach the file and can type the
   * fields by hand.
   */
  async parseCv(file: UploadedFile | undefined, actor: Actor): Promise<CvParseResponse> {
    // US-CAND-01: any unusable file is a 400 INVALID_UPLOAD for this endpoint.
    let kind: ReturnType<typeof detectFileKind>;
    try {
      kind = detectFileKind(file);
    } catch (error) {
      if (error instanceof AppException) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_UPLOAD', error.message);
      }
      throw error;
    }
    if (kind.ext !== 'pdf' && kind.ext !== 'docx') {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_UPLOAD',
        'Upload the CV as a PDF or Word (.docx) file.',
      );
    }
    const fileName = sanitizeFileName(file!.originalname, kind.ext);
    const storageKey = `cvdraft/${randomUUID()}/${randomUUID()}.${kind.ext}`;
    await this.storage.provider.put(storageKey, file!.buffer, kind.mimeType);

    let parsed: CvParseResponse['parsed'] = null;
    let aiResultId: string | null = null;
    let message: string | null = null;
    const text = await extractCvText(file!.buffer, kind.ext).catch((err: unknown) => {
      this.logger.warn({ err }, 'CV text extraction failed');
      return '';
    });
    if (text.length < MIN_CV_TEXT) {
      message = "We couldn't read text from this file (it may be a scan). Please fill the fields.";
    } else {
      try {
        const result = await this.llm.run({
          feature: 'CV_PARSE',
          prompt: 'cv-parse.v1',
          vars: { cv: untrusted(text) },
          schema: parsedCvSchema,
        });
        parsed = result.data;
        aiResultId = (
          await this.prisma.aiResult.create({
            data: {
              aiRequestId: result.aiRequestId,
              feature: 'CV_PARSE',
              entityType: 'cv_draft',
              output: parsed as Prisma.InputJsonValue,
            },
            select: { id: true },
          })
        ).id;
      } catch (error) {
        if (!(error instanceof AppException && error.code === 'AI_UNAVAILABLE')) throw error;
        message = 'Automatic parsing is unavailable — please fill the fields.';
      }
    }
    const cvToken = this.drafts.sign({
      storageKey,
      fileName,
      mimeType: kind.mimeType,
      sizeBytes: file!.size,
      uploadedById: actor.id,
      aiResultId,
    });
    return { cvToken, fileName, parsed, message };
  }

  /**
   * US-APP-03: ranks a job's active applications. The deterministic pre-score decides most of
   * the score; the LLM adds an explanation and an adjustment clamped to ±10. Results are cached
   * per application and prompt version.
   */
  async match(jobId: string, actor: Actor): Promise<MatchResult[]> {
    const job = await this.prisma.job.findFirst({
      where: { AND: [{ id: jobId, deletedAt: null }, jobReadScope(actor)] },
      select: {
        id: true,
        title: true,
        description: true,
        skills: { select: { name: true, weight: true, minYears: true } },
      },
    });
    if (!job) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found.');
    const applications = await this.prisma.application.findMany({
      where: {
        AND: [
          { jobId, stage: { notIn: ['REJECTED', 'WITHDRAWN'] }, candidate: { deletedAt: null } },
          applicationReadScope(actor),
        ],
      },
      select: {
        id: true,
        candidate: {
          select: {
            currentTitle: true,
            totalExperienceMonths: true,
            certifications: true,
            languages: true,
            education: true,
            skills: { select: { name: true, years: true } },
          },
        },
        matchResults: { where: { promptVersion: MATCH_PROMPT } },
      },
      orderBy: { appliedAt: 'asc' },
      take: MATCH_LIMIT,
    });
    const jobText = JSON.stringify({
      title: job.title,
      requirements: job.skills.map((s) => ({
        skill: s.name,
        mustHave: s.weight === 'MUST',
        minYears: s.minYears,
      })),
    });

    for (const app of applications) {
      if (app.matchResults.length) continue; // cached for this prompt version
      const pre = preScore(job, app.candidate);
      let adjustment = 0;
      let explanation: string | null = null;
      let aiRequestId: string | null = null;
      try {
        const res = await this.llm.run({
          feature: 'MATCH',
          prompt: MATCH_PROMPT,
          vars: {
            job: jobText,
            preScore: String(pre.score),
            matched: pre.matched.join(', ') || 'none',
            partial: pre.partial.join(', ') || 'none',
            missing: pre.missing.join(', ') || 'none',
            profile: untrusted(anonymisedProfile(app.candidate)),
          },
          schema: matchLlmSchema,
          entity: { type: 'application', id: app.id },
        });
        adjustment = res.data.adjustment;
        explanation = res.data.explanation;
        aiRequestId = res.aiRequestId;
      } catch (error) {
        if (!(error instanceof AppException && error.code === 'AI_UNAVAILABLE')) throw error;
        // Pre-score still ranks; not cached, so a later run can add the explanation.
        continue;
      }
      const final = finalScore(pre.score, adjustment);
      await this.prisma.matchResult.upsert({
        where: {
          applicationId_promptVersion: { applicationId: app.id, promptVersion: MATCH_PROMPT },
        },
        update: {},
        create: {
          applicationId: app.id,
          promptVersion: MATCH_PROMPT,
          preScore: pre.score,
          adjustment: final.adjustment,
          score: final.score,
          matched: pre.matched,
          partial: pre.partial,
          missing: pre.missing,
          explanation,
          aiRequestId,
        },
      });
    }
    return this.matchResults(jobId, actor);
  }

  /** Ranked results for applications the actor can see; pre-score only where AI hasn't run. */
  async matchResults(jobId: string, actor: Actor): Promise<MatchResult[]> {
    const job = await this.prisma.job.findFirst({
      where: { AND: [{ id: jobId }, jobReadScope(actor)] },
      select: { skills: { select: { name: true, weight: true, minYears: true } } },
    });
    if (!job) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found.');
    const apps = await this.prisma.application.findMany({
      where: {
        AND: [
          { jobId, stage: { notIn: ['REJECTED', 'WITHDRAWN'] }, candidate: { deletedAt: null } },
          applicationReadScope(actor),
        ],
      },
      select: {
        id: true,
        stage: true,
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            totalExperienceMonths: true,
            skills: { select: { name: true, years: true } },
          },
        },
        matchResults: { where: { promptVersion: MATCH_PROMPT } },
      },
      take: MATCH_LIMIT,
    });
    return apps
      .map((a) => {
        const r = a.matchResults[0];
        const pre = r ? null : preScore(job, a.candidate);
        return {
          applicationId: a.id,
          candidate: {
            id: a.candidate.id,
            name: `${a.candidate.firstName} ${a.candidate.lastName}`,
          },
          stage: a.stage,
          score: r?.score ?? pre!.score,
          preScore: r?.preScore ?? pre!.score,
          adjustment: r?.adjustment ?? 0,
          matched: (r?.matched as string[] | undefined) ?? pre!.matched,
          partial: (r?.partial as string[] | undefined) ?? pre!.partial,
          missing: (r?.missing as string[] | undefined) ?? pre!.missing,
          explanation: r?.explanation ?? null,
          promptVersion: MATCH_PROMPT,
          createdAt: (r?.createdAt ?? new Date()).toISOString(),
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /** US-AI-01: a draft only; the inclusive-language check runs on whatever the model wrote. */
  async jdDraft(input: {
    title: string;
    industry?: string;
    location?: string;
    salaryBand?: string;
    skills: string[];
  }): Promise<JdDraftResponse> {
    const res = await this.llm.run({
      feature: 'JD_DRAFT',
      prompt: 'jd-draft.v1',
      vars: {
        title: input.title,
        industry: input.industry ?? 'not specified',
        location: input.location ?? 'UAE',
        salaryBand: input.salaryBand ?? 'not specified',
        skills: input.skills.join(', ') || 'not specified',
      },
      schema: jdLlmSchema,
    });
    return {
      draft: res.data.draft,
      inclusiveLanguageFlags: inclusiveLanguageFlags(res.data.draft),
    };
  }

  /** US-INT-02: questions and rubric from the job itself (no candidate data). */
  async interviewKit(jobId: string, actor: Actor): Promise<InterviewKit> {
    const job = await this.prisma.job.findFirst({
      where: { AND: [{ id: jobId, deletedAt: null }, jobReadScope(actor)] },
      select: { id: true, title: true, description: true, skills: { select: { name: true } } },
    });
    if (!job) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found.');
    const res = await this.llm.run({
      feature: 'INTERVIEW_KIT',
      prompt: 'interview-kit.v1',
      vars: {
        title: job.title,
        description: untrusted(job.description ?? 'No description.', 6_000),
        skills: job.skills.map((s) => s.name).join(', ') || 'not specified',
      },
      schema: interviewKitSchema,
      entity: { type: 'job', id: job.id },
    });
    return res.data;
  }

  /** US-INT-03: summarises scorecards the actor can see; never decides. */
  async interviewSummary(applicationId: string, actor: Actor): Promise<InterviewSummary> {
    const app = await this.prisma.application.findFirst({
      where: { AND: [{ id: applicationId }, applicationReadScope(actor)] },
      select: { id: true, job: { select: { title: true } } },
    });
    if (!app) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'APPLICATION_NOT_FOUND',
        'Application not found.',
      );
    }
    const feedback = await this.prisma.interviewFeedback.findMany({
      where: { interview: { AND: [{ applicationId }, interviewReadScope(actor)] } },
      select: { scores: true, recommendation: true, notes: true },
    });
    if (feedback.length === 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NO_FEEDBACK',
        'There is no interview feedback to summarise yet.',
      );
    }
    // Interviewer names stay out: "Interviewer 1, 2…" is enough for a summary.
    const cards = feedback.map((f, i) => ({
      interviewer: `Interviewer ${i + 1}`,
      recommendation: f.recommendation,
      scores: f.scores,
      notes: f.notes,
    }));
    const res = await this.llm.run({
      feature: 'INTERVIEW_SUMMARY',
      prompt: 'interview-summary.v1',
      vars: { title: app.job.title, feedback: untrusted(JSON.stringify(cards), 12_000) },
      schema: interviewSummarySchema,
      entity: { type: 'application', id: app.id },
    });
    return res.data;
  }

  async requests(query: AiRequestListQuery): Promise<Paginated<AiRequest>> {
    const where: Prisma.AiRequestWhereInput = { feature: query.feature };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.aiRequest.findMany({
        where,
        include: { user: userNameSelect },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.aiRequest.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        feature: r.feature,
        provider: r.provider,
        model: r.model,
        promptVersion: r.promptVersion,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        estimatedCostMicroUsd: r.estimatedCostMicroUsd,
        latencyMs: r.latencyMs,
        status: r.status,
        errorCode: r.errorCode,
        user: personName(r.user),
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }

  /** US-AI-03: month-to-date cost per feature against the budget. */
  async usage(): Promise<AiUsage> {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const [totals, byFeature, failed] = await Promise.all([
      this.llm.usage(),
      this.prisma.aiRequest.groupBy({
        by: ['feature'],
        where: { createdAt: { gte: start } },
        _count: { _all: true },
        _sum: { estimatedCostMicroUsd: true },
      }),
      this.prisma.aiRequest.groupBy({
        by: ['feature'],
        where: { createdAt: { gte: start }, status: { not: 'SUCCEEDED' } },
        _count: { _all: true },
      }),
    ]);
    return {
      ...totals,
      provider: this.llm.provider.name,
      model: this.llm.provider.model,
      byFeature: byFeature.map((f) => ({
        feature: f.feature,
        calls: f._count._all,
        failed: failed.find((x) => x.feature === f.feature)?._count._all ?? 0,
        costMicroUsd: f._sum.estimatedCostMicroUsd ?? 0,
      })),
    };
  }
}
