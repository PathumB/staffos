import { HttpStatus, Injectable } from '@nestjs/common';
import { type ApprovalOutcome, nextApprovalState, type WorkflowSubject } from '@staffos/shared';
import { type Actor, hasRole } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

type Tx = Prisma.TransactionClient;

export type ApprovalSubjectRef = { subject: WorkflowSubject; entityId: string; title: string };

const subjectWhere = (ref: { subject: WorkflowSubject; entityId: string }) =>
  ref.subject === 'MANPOWER_REQUEST'
    ? { manpowerRequestId: ref.entityId }
    : { offerId: ref.entityId };

export const approvalLink = (subject: WorkflowSubject, entityId: string, applicationId?: string) =>
  subject === 'MANPOWER_REQUEST'
    ? `/requests/${entityId}`
    : `/applications/${applicationId ?? entityId}`;

/**
 * Runs approval chains (US-WF-01) for the subject services (manpower requests, offers) inside
 * their own transactions, so the subject's status and the chain can never disagree.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The pending chain for a subject, if any. */
  pending(
    ref: { subject: WorkflowSubject; entityId: string },
    db: Tx | PrismaService = this.prisma,
  ) {
    return db.approvalRequest.findFirst({
      where: { ...subjectWhere(ref), status: 'PENDING' },
      include: { workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } } },
    });
  }

  /**
   * Starts a chain: the given workflow, or else the newest active one for the subject. Returns
   * false when there is no chain to run (callers then use their built-in single approval). A
   * second start while one is pending is a no-op.
   */
  async start(
    ref: ApprovalSubjectRef & { link: string },
    tx: Tx,
    workflowId?: string,
  ): Promise<boolean> {
    if (await this.pending(ref, tx)) return true;
    const workflow = await tx.workflowDefinition.findFirst({
      where: workflowId
        ? { id: workflowId, active: true, subject: ref.subject }
        : { active: true, subject: ref.subject },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    const first = workflow?.steps[0];
    if (!workflow || !first) return false;
    const approval = await tx.approvalRequest.create({
      data: { workflowId: workflow.id, subject: ref.subject, ...subjectWhere(ref) },
    });
    await this.audit.record(
      {
        action: 'START',
        entity: 'approval_request',
        entityId: approval.id,
        after: { workflowId: workflow.id, subject: ref.subject, entityId: ref.entityId },
      },
      tx,
    );
    await this.notifyStep(first.approverRole, first.name, ref, tx);
    return true;
  }

  /**
   * Records a decision on the pending chain. Returns null when there is none. Only a holder of the
   * current step's role (or a Super Admin) may decide; each step is decided once.
   */
  async decide(
    ref: ApprovalSubjectRef & { link: string },
    decision: 'APPROVED' | 'REJECTED',
    comment: string | null,
    actor: Actor,
    tx: Tx,
  ): Promise<ApprovalOutcome | null> {
    const approval = await this.pending(ref, tx);
    if (!approval) return null;
    const steps = approval.workflow.steps;
    const step = steps.find((s) => s.stepOrder === approval.currentStep);
    if (!step || !(hasRole(actor, step.approverRole) || hasRole(actor, 'SUPER_ADMIN'))) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'NOT_YOUR_APPROVAL_STEP',
        `This step ("${step?.name ?? 'unknown'}") is waiting for another role.`,
        { currentStep: approval.currentStep, approverRole: step?.approverRole ?? null },
      );
    }
    const next = nextApprovalState(approval.currentStep, steps.length, decision);
    await tx.approvalDecision.create({
      data: {
        approvalRequestId: approval.id,
        stepOrder: approval.currentStep,
        decision,
        comment,
        decidedById: actor.id,
      },
    });
    const done = next.outcome !== 'ADVANCED';
    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        currentStep: next.currentStep,
        ...(done ? { status: next.outcome as 'APPROVED' | 'REJECTED', decidedAt: new Date() } : {}),
      },
    });
    await this.audit.record(
      {
        action: decision === 'APPROVED' ? 'APPROVE_STEP' : 'REJECT_STEP',
        entity: 'approval_request',
        entityId: approval.id,
        before: { currentStep: approval.currentStep, status: 'PENDING' },
        after: {
          currentStep: next.currentStep,
          status: done ? next.outcome : 'PENDING',
          comment,
        },
      },
      tx,
    );
    if (next.outcome === 'ADVANCED') {
      const nextStep = steps.find((s) => s.stepOrder === next.currentStep)!;
      await this.notifyStep(nextStep.approverRole, nextStep.name, ref, tx);
    }
    return next.outcome;
  }

  /** The subject was withdrawn or cancelled: close its pending chain. */
  async cancel(ref: { subject: WorkflowSubject; entityId: string }, tx: Tx): Promise<void> {
    await tx.approvalRequest.updateMany({
      where: { ...subjectWhere(ref), status: 'PENDING' },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
  }

  private async notifyStep(
    role: Prisma.WorkflowStepCreateManyInput['approverRole'],
    stepName: string,
    ref: ApprovalSubjectRef & { link: string },
    tx: Tx,
  ) {
    const approvers = await tx.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: role } } } },
      select: { id: true },
    });
    await this.notifications.notify(
      approvers.map((u) => u.id),
      {
        type: 'approval.requested',
        title: `Approval needed (${stepName}): ${ref.title}`,
        link: ref.link,
      },
      tx,
    );
  }
}
