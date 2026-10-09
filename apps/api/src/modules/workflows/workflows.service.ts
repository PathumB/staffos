import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Approval,
  ApprovalListQuery,
  Paginated,
  Workflow,
  WorkflowInput,
  WorkflowUpdate,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { personName, userNameSelect } from '../../common/errors/prisma-errors';
import { paginated, toSkipTake } from '../../common/pagination/pagination';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { approvalLink } from './approvals.service';

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'WORKFLOW_NOT_FOUND', 'Workflow not found.');

const workflowInclude = {
  steps: { orderBy: { stepOrder: 'asc' } },
  _count: { select: { approvalRequests: { where: { status: 'PENDING' } } } },
} as const satisfies Prisma.WorkflowDefinitionInclude;

type WorkflowRow = Prisma.WorkflowDefinitionGetPayload<{ include: typeof workflowInclude }>;

function toWorkflow(w: WorkflowRow): Workflow {
  return {
    id: w.id,
    name: w.name,
    subject: w.subject,
    active: w.active,
    steps: w.steps.map((s) => ({
      stepOrder: s.stepOrder,
      name: s.name,
      approverRole: s.approverRole,
    })),
    pendingCount: w._count.approvalRequests,
    createdAt: w.createdAt.toISOString(),
  };
}

const approvalInclude = {
  workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
  decisions: { orderBy: { stepOrder: 'asc' }, include: { decidedBy: userNameSelect } },
  manpowerRequest: {
    select: { roleTitle: true, headcount: true, client: { select: { name: true } } },
  },
  offer: {
    select: {
      applicationId: true,
      application: {
        select: {
          candidate: { select: { firstName: true, lastName: true } },
          job: { select: { title: true } },
        },
      },
    },
  },
} as const satisfies Prisma.ApprovalRequestInclude;

type ApprovalRow = Prisma.ApprovalRequestGetPayload<{ include: typeof approvalInclude }>;

function toApproval(a: ApprovalRow): Approval {
  const step = a.workflow.steps.find((s) => s.stepOrder === a.currentStep);
  const pending = a.status === 'PENDING';
  const mr = a.manpowerRequest;
  const offer = a.offer;
  const entityId = (a.manpowerRequestId ?? a.offerId)!;
  return {
    id: a.id,
    workflow: { id: a.workflow.id, name: a.workflow.name },
    subject: a.subject,
    entityId,
    title: mr
      ? `${mr.roleTitle} ×${mr.headcount} for ${mr.client.name}`
      : offer
        ? `Offer: ${offer.application.candidate.firstName} ${offer.application.candidate.lastName} (${offer.application.job.title})`
        : 'Approval',
    link: approvalLink(a.subject, entityId, offer?.applicationId),
    status: a.status,
    currentStep: a.currentStep,
    totalSteps: a.workflow.steps.length,
    currentStepName: pending ? (step?.name ?? null) : null,
    currentRole: pending ? (step?.approverRole ?? null) : null,
    decisions: a.decisions.map((d) => ({
      stepOrder: d.stepOrder,
      decision: d.decision,
      comment: d.comment,
      decidedBy: personName(d.decidedBy)!,
      decidedAt: d.decidedAt.toISOString(),
    })),
    createdAt: a.createdAt.toISOString(),
  };
}

/** Approval chain definitions (US-WF-01) and the approvals inbox. */
@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Workflow[]> {
    const rows = await this.prisma.workflowDefinition.findMany({
      include: workflowInclude,
      orderBy: [{ subject: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toWorkflow);
  }

  async get(id: string): Promise<Workflow> {
    const row = await this.prisma.workflowDefinition.findUnique({
      where: { id },
      include: workflowInclude,
    });
    if (!row) throw notFound();
    return toWorkflow(row);
  }

  async create(input: WorkflowInput, actor: Actor): Promise<Workflow> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.workflowDefinition.create({
        data: {
          name: input.name,
          subject: input.subject,
          active: input.active ?? true,
          createdById: actor.id,
          steps: {
            create: input.steps.map((s, i) => ({
              stepOrder: i + 1,
              name: s.name,
              approverRole: s.approverRole,
            })),
          },
        },
        include: workflowInclude,
      });
      const after = toWorkflow(row);
      await this.audit.record(
        { action: 'CREATE', entity: 'workflow', entityId: row.id, after },
        tx,
      );
      return after;
    });
  }

  /**
   * Steps are replaced as a whole. Chains already running keep reading the live steps, so a step
   * change is refused while approvals are pending (409) rather than silently re-routing them.
   */
  async update(id: string, input: WorkflowUpdate): Promise<Workflow> {
    const before = await this.get(id);
    if (input.steps && before.pendingCount > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'WORKFLOW_IN_USE',
        'Steps can’t change while approvals are pending. Create a new workflow instead.',
        { pendingCount: before.pendingCount },
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.steps) {
        await tx.workflowStep.deleteMany({ where: { workflowId: id } });
        await tx.workflowStep.createMany({
          data: input.steps.map((s, i) => ({
            workflowId: id,
            stepOrder: i + 1,
            name: s.name,
            approverRole: s.approverRole,
          })),
        });
      }
      const row = await tx.workflowDefinition.update({
        where: { id },
        data: { name: input.name, active: input.active },
        include: workflowInclude,
      });
      const after = toWorkflow(row);
      await this.audit.record(
        { action: 'UPDATE', entity: 'workflow', entityId: id, before, after },
        tx,
      );
      return after;
    });
  }

  /** `me`: pending approvals whose current step is for one of my roles (any authenticated user). */
  async approvals(query: ApprovalListQuery, actor: Actor): Promise<Paginated<Approval>> {
    let where: Prisma.ApprovalRequestWhereInput;
    if (query.assignedTo === 'all') {
      if (!actor.permissions.has('workflows:manage')) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'You can only see your own approvals.',
        );
      }
      where = query.status ? { status: query.status } : {};
    } else {
      const steps = await this.prisma.workflowStep.findMany({
        where: actor.roles.includes('SUPER_ADMIN') ? {} : { approverRole: { in: actor.roles } },
        select: { workflowId: true, stepOrder: true },
      });
      where = {
        status: 'PENDING',
        OR: steps.length
          ? steps.map((s) => ({ workflowId: s.workflowId, currentStep: s.stepOrder }))
          : [{ id: { in: [] } }],
      };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.approvalRequest.findMany({
        where,
        include: approvalInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);
    return paginated(rows.map(toApproval), total, query);
  }
}
