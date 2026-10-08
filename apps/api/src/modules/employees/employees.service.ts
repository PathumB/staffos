import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EMPLOYEE_CONTACT_FIELDS,
  type Employee,
  type EmployeeListQuery,
  type EmployeeUpdateData,
  type Paginated,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  canSeePay,
  employeeReadScope,
  employeeWriteScope,
  isHrAdmin,
} from '../../common/scoping/hr-scope';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { assertEmployeeEditable } from '../onboarding/onboarding.rules';

const include = {
  department: { select: { id: true, name: true } },
  position: { select: { id: true, title: true } },
  user: { select: { id: true, status: true } },
  application: {
    select: { job: { select: { id: true, title: true, client: { select: { name: true } } } } },
  },
  onboardingPlan: { select: { id: true, status: true, tasks: { select: { status: true } } } },
} satisfies Prisma.EmployeeInclude;
type Row = Prisma.EmployeeGetPayload<{ include: typeof include }>;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function toEmployee(e: Row, actor: Actor): Employee {
  const plan = e.onboardingPlan;
  const job = e.application?.job;
  return {
    id: e.id,
    employeeNumber: e.employeeNumber,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    phone: e.phone,
    status: e.status,
    hireDate: isoDay(e.hireDate),
    salaryFils: canSeePay(actor, e.id) ? e.salaryFils : null,
    currency: e.currency,
    version: e.version,
    department: e.department,
    position: e.position,
    account: e.user,
    candidateId: e.candidateId,
    applicationId: e.applicationId,
    job: job ? { id: job.id, title: job.title, client: job.client.name } : null,
    onboarding: plan
      ? {
          planId: plan.id,
          status: plan.status,
          done: plan.tasks.filter((t) => t.status !== 'PENDING').length,
          total: plan.tasks.length,
        }
      : null,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Fields worth an audit trail (pay included: changes to it must be traceable). */
function snapshot(e: Row) {
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    phone: e.phone,
    status: e.status,
    departmentId: e.departmentId,
    positionId: e.positionId,
    salaryFils: e.salaryFils,
  };
}

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async list(query: EmployeeListQuery, actor: Actor): Promise<Paginated<Employee>> {
    const f = query.filter ?? {};
    const search = query.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      AND: [
        employeeReadScope(actor),
        {
          status: f.status,
          departmentId: f.departmentId,
          ...(f.clientId
            ? { deployments: { some: { clientId: f.clientId, status: 'ACTIVE' } } }
            : {}),
        },
        search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { employeeNumber: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.employee.count({ where }),
    ]);
    return paginated(
      rows.map((e) => toEmployee(e, actor)),
      total,
      query,
    );
  }

  async get(id: string, actor: Actor): Promise<Employee> {
    return toEmployee(await this.find(id, employeeReadScope(actor)), actor);
  }

  /**
   * US-EMP-01: HR edits the record; an employee may change only their own contact fields.
   * Terminating also cancels an unfinished onboarding plan and closes the person's login.
   */
  async update(id: string, input: EmployeeUpdateData, actor: Actor): Promise<Employee> {
    const before = await this.find(id, employeeWriteScope(actor));
    assertEmployeeEditable(before.status);
    const { version, ...changes } = input;
    if (!isHrAdmin(actor)) {
      const allowed = new Set<string>(EMPLOYEE_CONTACT_FIELDS);
      const blocked = Object.keys(changes).filter((k) => !allowed.has(k));
      if (blocked.length) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'EMPLOYEE_FIELDS_RESTRICTED',
          'You can only change your own contact details.',
          { fields: blocked },
        );
      }
    }
    await this.assertOrgRefs(changes.departmentId, changes.positionId);

    const terminating = changes.status === 'TERMINATED';
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.employee.updateMany({
        where: { id, version },
        data: { ...changes, version: { increment: 1 } },
      });
      if (count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'STALE_VERSION',
          'This employee was changed by someone else. Reload and try again.',
          { currentVersion: before.version },
        );
      }
      if (terminating) {
        await tx.onboardingPlan.updateMany({
          where: { employeeId: id, status: 'IN_PROGRESS' },
          data: { status: 'CANCELLED' },
        });
        if (before.userId) {
          await tx.user.update({ where: { id: before.userId }, data: { status: 'DEACTIVATED' } });
          await this.auth.revokeAllSessions(before.userId, tx);
        }
      }
      const after = await tx.employee.findUniqueOrThrow({ where: { id }, include });
      await this.audit.record(
        {
          action: terminating ? 'TERMINATE' : 'UPDATE',
          entity: 'employee',
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return toEmployee(after, actor);
    });
  }

  /**
   * Gives a hired employee a StaffOS login (EMPLOYEE role) linked to their record, so they can see
   * their profile and complete onboarding tasks. HR only.
   */
  async invite(id: string, actor: Actor): Promise<Employee> {
    if (!isHrAdmin(actor)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only HR can invite employees.');
    }
    const employee = await this.find(id, employeeWriteScope(actor));
    assertEmployeeEditable(employee.status);
    if (employee.userId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'EMPLOYEE_HAS_ACCOUNT',
        'This employee already has a StaffOS login.',
      );
    }
    let user: { id: string; email: string; firstName: string };
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.findUniqueOrThrow({ where: { code: 'EMPLOYEE' } });
        const created = await tx.user.create({
          data: {
            email: employee.email.toLowerCase(),
            firstName: employee.firstName,
            lastName: employee.lastName,
            status: 'INVITED',
            createdById: actor.id,
            roles: { create: [{ roleId: role.id }] },
          },
        });
        await tx.employee.update({
          where: { id },
          data: { userId: created.id, version: { increment: 1 } },
        });
        await this.audit.record(
          {
            action: 'INVITE',
            entity: 'employee',
            entityId: id,
            after: { userId: created.id, role: 'EMPLOYEE' },
          },
          tx,
        );
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'USER_EMAIL_EXISTS',
          'A user with this email already exists. Change the employee email first.',
        );
      }
      throw error;
    }
    // Queued after commit, so a mail problem never undoes the invitation.
    await this.auth.sendInvitation(user);
    return this.get(id, actor);
  }

  private async find(id: string, scope: Prisma.EmployeeWhereInput): Promise<Row> {
    const row = await this.prisma.employee.findFirst({
      where: { AND: [{ id }, scope] },
      include,
    });
    if (!row) throw notFound();
    return row;
  }

  private async assertOrgRefs(departmentId?: string | null, positionId?: string | null) {
    if (departmentId && !(await this.prisma.department.count({ where: { id: departmentId } }))) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'DEPARTMENT_NOT_FOUND',
        'Department not found.',
      );
    }
    if (positionId && !(await this.prisma.position.count({ where: { id: positionId } }))) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'POSITION_NOT_FOUND',
        'Position not found.',
      );
    }
  }
}
