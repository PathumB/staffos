import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateUserInput,
  Paginated,
  Role,
  RoleCode,
  UpdateUserInput,
  User,
  UserListQuery,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

const userInclude = {
  roles: { include: { role: true } },
  client: { select: { id: true, name: true } },
} satisfies Prisma.UserInclude;
type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function toUser(u: UserRow): User {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    status: u.status,
    roles: u.roles.map((r) => r.role.code).sort(),
    client: u.client,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Audit snapshot: only the fields an admin can change. */
const snapshot = (u: User) => ({
  firstName: u.firstName,
  lastName: u.lastName,
  status: u.status,
  roles: u.roles,
});

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found.');

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async list(query: UserListQuery): Promise<Paginated<User>> {
    const where: Prisma.UserWhereInput = {
      status: query.filter?.status,
      roles: query.filter?.role ? { some: { role: { code: query.filter.role } } } : undefined,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map(toUser), total, query);
  }

  async get(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: userInclude });
    if (!user) throw notFound();
    return toUser(user);
  }

  async create(input: CreateUserInput, actor: Actor): Promise<User> {
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: input.clientId, deletedAt: null },
      });
      if (!client) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CLIENT_NOT_FOUND',
          'Client not found.',
        );
      }
    }
    let created: User;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            clientId: input.clientId ?? null,
            status: 'INVITED',
            createdById: actor.id,
            roles: { create: await this.roleLinks(tx, input.roles) },
          },
          include: userInclude,
        });
        const dto = toUser(user);
        await this.audit.record(
          {
            action: 'CREATE',
            entity: 'user',
            entityId: user.id,
            after: { email: dto.email, ...snapshot(dto) },
          },
          tx,
        );
        return dto;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'USER_EMAIL_EXISTS',
          'A user with this email already exists.',
        );
      }
      throw error;
    }
    // Email is queued after commit, so a mail failure can never roll back the user.
    await this.auth.sendInvitation(created);
    return created;
  }

  async update(id: string, input: UpdateUserInput, actor: Actor): Promise<User> {
    const before = await this.get(id);
    if (
      input.roles &&
      id === actor.id &&
      before.roles.includes('SUPER_ADMIN') &&
      !input.roles.includes('SUPER_ADMIN')
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CANNOT_REMOVE_OWN_ADMIN',
        'You cannot remove your own Super Admin role.',
      );
    }
    if (
      input.roles?.includes('CLIENT_USER') !== before.roles.includes('CLIENT_USER') &&
      input.roles
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CLIENT_ROLE_CHANGE',
        'Client users and internal users cannot be converted into each other.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          ...(input.roles
            ? { roles: { deleteMany: {}, create: await this.roleLinks(tx, input.roles) } }
            : {}),
        },
        include: userInclude,
      });
      const after = toUser(updated);
      if (input.roles && after.roles.join() !== before.roles.join()) {
        // New permissions must not ride on old sessions.
        await this.auth.revokeAllSessions(id, tx);
      }
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'user',
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
  }

  async deactivate(id: string, actor: Actor): Promise<User> {
    if (id === actor.id) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CANNOT_DEACTIVATE_SELF',
        'You cannot deactivate your own account.',
      );
    }
    return this.setStatus(id, 'DEACTIVATED', 'DEACTIVATE');
  }

  async reactivate(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true, status: true },
    });
    if (!user) throw notFound();
    return this.setStatus(id, user.passwordHash ? 'ACTIVE' : 'INVITED', 'REACTIVATE');
  }

  async resendInvitation(id: string): Promise<void> {
    const user = await this.get(id);
    if (user.status !== 'INVITED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'USER_NOT_INVITED',
        'Only invited users can be re-invited.',
      );
    }
    await this.auth.sendInvitation(user);
    await this.audit.record({ action: 'INVITATION_SENT', entity: 'user', entityId: id });
  }

  async listRoles(): Promise<Role[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((p) => p.permission.code).sort(),
      userCount: r._count.users,
    }));
  }

  private async setStatus(id: string, status: User['status'], action: string): Promise<User> {
    const before = await this.get(id);
    if (before.status === status) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_TRANSITION',
        `User is already ${status.toLowerCase()}.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = toUser(
        await tx.user.update({ where: { id }, data: { status }, include: userInclude }),
      );
      if (status === 'DEACTIVATED') await this.auth.revokeAllSessions(id, tx);
      await this.audit.record(
        {
          action,
          entity: 'user',
          entityId: id,
          before: { status: before.status },
          after: { status },
        },
        tx,
      );
      return updated;
    });
  }

  private async roleLinks(tx: Prisma.TransactionClient, codes: RoleCode[]) {
    const roles = await tx.role.findMany({ where: { code: { in: codes } }, select: { id: true } });
    return roles.map((r) => ({ roleId: r.id }));
  }
}
