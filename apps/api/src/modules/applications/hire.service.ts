import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { employeeNumber, isJobFilled, planTasksFromTemplate } from './hire.rules';

/**
 * US-OFFER-02: hiring creates the employee and their onboarding plan. Runs inside the caller's
 * transaction (the HIRED stage change), so if any step fails nothing is created and the
 * application stays in OFFER.
 */
@Injectable()
export class HireService {
  constructor(
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async hire(
    tx: Prisma.TransactionClient,
    applicationId: string,
    actor: Actor,
  ): Promise<{ employeeId: string }> {
    const application = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        id: true,
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        job: {
          select: {
            id: true,
            title: true,
            category: true,
            headcount: true,
            status: true,
            client: { select: { name: true, accountManagerId: true } },
          },
        },
        offers: { where: { status: 'ACCEPTED' }, take: 1 },
      },
    });
    const offer = application.offers[0];
    if (!offer) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'OFFER_NOT_ACCEPTED',
        'A candidate can only be hired after accepting an offer.',
      );
    }
    const { candidate, job } = application;

    // Sequence value, not user input: safe as a fixed raw query.
    const [{ n }] = await tx.$queryRaw<[{ n: bigint }]>`SELECT nextval('employee_number_seq') AS n`;
    let employee;
    try {
      employee = await tx.employee.create({
        data: {
          employeeNumber: employeeNumber(n),
          candidateId: candidate.id,
          applicationId: application.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          status: 'ONBOARDING',
          hireDate: offer.startDate,
          salaryFils: offer.salaryFils,
          currency: offer.currency,
          createdById: actor.id,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_EMPLOYED',
          'This candidate already has an employee record.',
        );
      }
      throw error;
    }

    // The job category's template, else the default (category = null) one.
    const template =
      (await tx.onboardingTemplate.findFirst({
        where: { category: job.category, active: true },
        include: { tasks: true },
      })) ??
      (await tx.onboardingTemplate.findFirst({
        where: { category: null, active: true },
        include: { tasks: true },
      }));
    const plan = await tx.onboardingPlan.create({
      data: {
        employeeId: employee.id,
        templateId: template?.id ?? null,
        startDate: offer.startDate,
        tasks: { create: planTasksFromTemplate(template?.tasks ?? [], offer.startDate) },
      },
      include: { _count: { select: { tasks: true } } },
    });

    await this.audit.record(
      {
        action: 'HIRE',
        entity: 'employee',
        entityId: employee.id,
        after: {
          employeeNumber: employee.employeeNumber,
          applicationId: application.id,
          offerId: offer.id,
          onboardingPlanId: plan.id,
          templateId: template?.id ?? null,
          tasks: plan._count.tasks,
        },
      },
      tx,
    );

    const hired = await tx.application.count({ where: { jobId: job.id, stage: 'HIRED' } });
    if ((job.status === 'OPEN' || job.status === 'ON_HOLD') && isJobFilled(hired, job.headcount)) {
      await tx.job.update({
        where: { id: job.id },
        data: { status: 'FILLED', closedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.record(
        {
          action: 'FILL',
          entity: 'job',
          entityId: job.id,
          before: { status: job.status },
          after: { status: 'FILLED', hired },
        },
        tx,
      );
    }

    await this.notifications.notify(
      [job.client.accountManagerId],
      {
        type: 'application.hired',
        title: `Hired: ${candidate.firstName} ${candidate.lastName}`,
        body: `${job.title} for ${job.client.name}. Onboarding has started.`,
        link: `/jobs/${job.id}`,
      },
      tx,
    );
    return { employeeId: employee.id };
  }
}
