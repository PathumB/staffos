import { HttpStatus, Injectable } from '@nestjs/common';
import type { Department, DepartmentInput, Position, PositionInput } from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import { isHrAdmin } from '../../common/scoping/hr-scope';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const positionInclude = { department: { select: { id: true, name: true } } } as const;

/** Departments and positions: everyone with employees:read lists them; only HR changes them. */
@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  departments(): Promise<Department[]> {
    return this.prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async positions(): Promise<Position[]> {
    return this.prisma.position.findMany({
      select: { id: true, title: true, ...positionInclude },
      orderBy: { title: 'asc' },
    });
  }

  async saveDepartment(input: DepartmentInput, actor: Actor, id?: string): Promise<Department> {
    this.assertHr(actor);
    try {
      const before = id ? await this.prisma.department.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound('DEPARTMENT');
      return await this.prisma.$transaction(async (tx) => {
        const row = id
          ? await tx.department.update({ where: { id }, data: { name: input.name } })
          : await tx.department.create({ data: { name: input.name } });
        await this.audit.record(
          {
            action: id ? 'UPDATE' : 'CREATE',
            entity: 'department',
            entityId: row.id,
            before: before ? { name: before.name } : undefined,
            after: { name: row.name },
          },
          tx,
        );
        return { id: row.id, name: row.name };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw exists('DEPARTMENT', 'A department with this name');
      throw error;
    }
  }

  async savePosition(input: PositionInput, actor: Actor, id?: string): Promise<Position> {
    this.assertHr(actor);
    if (
      input.departmentId &&
      !(await this.prisma.department.count({ where: { id: input.departmentId } }))
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'DEPARTMENT_NOT_FOUND',
        'Department not found.',
      );
    }
    try {
      const before = id ? await this.prisma.position.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound('POSITION');
      const data = { title: input.title, departmentId: input.departmentId ?? null };
      return await this.prisma.$transaction(async (tx) => {
        const row = id
          ? await tx.position.update({ where: { id }, data, include: positionInclude })
          : await tx.position.create({ data, include: positionInclude });
        await this.audit.record(
          {
            action: id ? 'UPDATE' : 'CREATE',
            entity: 'position',
            entityId: row.id,
            before: before ? { title: before.title, departmentId: before.departmentId } : undefined,
            after: data,
          },
          tx,
        );
        return { id: row.id, title: row.title, department: row.department };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw exists('POSITION', 'A position with this title');
      throw error;
    }
  }

  // Employees hold employees:write for their own contact details, so the permission alone
  // isn't enough here.
  private assertHr(actor: Actor) {
    if (!isHrAdmin(actor)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Only HR can change departments and positions.',
      );
    }
  }
}

const notFound = (entity: 'DEPARTMENT' | 'POSITION') =>
  new AppException(
    HttpStatus.NOT_FOUND,
    `${entity}_NOT_FOUND`,
    `${entity === 'DEPARTMENT' ? 'Department' : 'Position'} not found.`,
  );
const exists = (entity: 'DEPARTMENT' | 'POSITION', what: string) =>
  new AppException(HttpStatus.CONFLICT, `${entity}_EXISTS`, `${what} already exists.`);
