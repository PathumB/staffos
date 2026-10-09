import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Activity,
  ActivityInput,
  Client,
  ClientCreate,
  ClientListQuery,
  ClientUpdate,
  Contact,
  ContactInput,
  Paginated,
  Project,
  ProjectInput,
} from '@staffos/shared';
import { type Actor, hasRole } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import {
  fromDate,
  isUniqueViolation,
  personName,
  toDate,
  userNameSelect,
} from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  clientReadScope,
  clientWriteScope,
  projectWriteScope,
} from '../../common/scoping/crm-scope';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';

const OPEN_REQUEST_STATUSES = ['SUBMITTED', 'PENDING_APPROVAL', 'APPROVED'] as const;

const clientInclude = {
  accountManager: userNameSelect,
  _count: {
    select: { manpowerRequests: { where: { status: { in: [...OPEN_REQUEST_STATUSES] } } } },
  },
} satisfies Prisma.ClientInclude;
type ClientRow = Prisma.ClientGetPayload<{ include: typeof clientInclude }>;

function toClient(c: ClientRow): Client {
  return {
    id: c.id,
    name: c.name,
    industry: c.industry,
    trn: c.trn,
    vatRateBps: c.vatRateBps,
    addressLine1: c.addressLine1,
    city: c.city,
    emirate: c.emirate,
    paymentTermsDays: c.paymentTermsDays,
    status: c.status,
    accountManager: personName(c.accountManager)!,
    openRequests: c._count.manpowerRequests,
    createdAt: c.createdAt.toISOString(),
  };
}

const contactInclude = {
  portalUser: { select: { id: true, status: true } },
} satisfies Prisma.ClientContactInclude;
function toContact(c: Prisma.ClientContactGetPayload<{ include: typeof contactInclude }>): Contact {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    jobTitle: c.jobTitle,
    isPrimary: c.isPrimary,
    portalUser: c.portalUser,
  };
}

function toProject(p: Prisma.ProjectGetPayload<object>): Project {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    location: p.location,
    emirate: p.emirate,
    status: p.status,
    startDate: fromDate(p.startDate),
    endDate: fromDate(p.endDate),
  };
}

const clientNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'CLIENT_NOT_FOUND', 'Client not found.');
const contactNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'CONTACT_NOT_FOUND', 'Contact not found.');

/** Fields an audit entry should show for a client. */
const clientSnapshot = (c: Client) => {
  const { openRequests: _o, createdAt: _c, accountManager, ...rest } = c;
  return { ...rest, accountManagerId: accountManager.id };
};

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
  ) {}

  // ── Clients ──

  async list(query: ClientListQuery, actor: Actor): Promise<Paginated<Client>> {
    const f = query.filter ?? {};
    const where: Prisma.ClientWhereInput = {
      AND: [
        clientReadScope(actor),
        {
          deletedAt: null,
          industry: f.industry,
          status: f.status,
          accountManagerId: f.accountManagerId,
        },
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { trn: { contains: query.search } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: clientInclude,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.client.count({ where }),
    ]);
    return paginated(rows.map(toClient), total, query);
  }

  async get(id: string, actor: Actor): Promise<Client> {
    return toClient(await this.findClient(id, clientReadScope(actor)));
  }

  async create(input: ClientCreate, actor: Actor): Promise<Client> {
    const accountManagerId = await this.resolveAccountManager(input.accountManagerId, actor);
    const vatRateBps =
      input.vatRateBps ??
      (await this.settings.get('vat.defaultRateBps', z.number().int().min(0).max(10_000), 500));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const client = toClient(
          await tx.client.create({
            data: { ...input, vatRateBps, accountManagerId, createdById: actor.id },
            include: clientInclude,
          }),
        );
        await this.audit.record(
          {
            action: 'CREATE',
            entity: 'client',
            entityId: client.id,
            after: clientSnapshot(client),
          },
          tx,
        );
        return client;
      });
    } catch (error) {
      throw this.mapTrnConflict(error);
    }
  }

  async update(id: string, input: ClientUpdate, actor: Actor): Promise<Client> {
    const before = toClient(await this.findClient(id, clientWriteScope(actor)));
    const accountManagerId =
      input.accountManagerId && input.accountManagerId !== before.accountManager.id
        ? await this.resolveAccountManager(input.accountManagerId, actor)
        : undefined;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const after = toClient(
          await tx.client.update({
            where: { id },
            data: { ...input, accountManagerId },
            include: clientInclude,
          }),
        );
        await this.audit.record(
          {
            action: 'UPDATE',
            entity: 'client',
            entityId: id,
            before: clientSnapshot(before),
            after: clientSnapshot(after),
          },
          tx,
        );
        return after;
      });
    } catch (error) {
      throw this.mapTrnConflict(error);
    }
  }

  /** Soft delete; history (requests, invoices) stays intact. */
  async remove(id: string, actor: Actor): Promise<void> {
    const client = await this.findClient(id, clientWriteScope(actor));
    const active = await this.prisma.deployment.count({
      where: { clientId: id, status: { in: ['PLANNED', 'ACTIVE'] } },
    });
    if (active > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CLIENT_HAS_ACTIVE_DEPLOYMENTS',
        'This client has active deployments and cannot be archived.',
        { activeDeployments: active },
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      });
      await this.audit.record(
        { action: 'DELETE', entity: 'client', entityId: id, before: { name: client.name } },
        tx,
      );
    });
  }

  // ── Contacts ──

  async listContacts(clientId: string, actor: Actor): Promise<Contact[]> {
    await this.findClient(clientId, clientReadScope(actor));
    const rows = await this.prisma.clientContact.findMany({
      where: { clientId, deletedAt: null },
      include: contactInclude,
      orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }],
    });
    return rows.map(toContact);
  }

  async createContact(
    clientId: string,
    input: ContactInput & { isPrimary: boolean },
    actor: Actor,
  ): Promise<Contact> {
    await this.findClient(clientId, clientWriteScope(actor));
    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary) await this.clearPrimary(tx, clientId);
      const contact = toContact(
        await tx.clientContact.create({
          data: { ...input, clientId, createdById: actor.id },
          include: contactInclude,
        }),
      );
      await this.audit.record(
        { action: 'CREATE', entity: 'client_contact', entityId: contact.id, after: contact },
        tx,
      );
      return contact;
    });
  }

  async updateContact(
    clientId: string,
    contactId: string,
    input: Partial<ContactInput>,
    actor: Actor,
  ): Promise<Contact> {
    await this.findClient(clientId, clientWriteScope(actor));
    const before = await this.findContact(clientId, contactId);
    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary) await this.clearPrimary(tx, clientId);
      const after = toContact(
        await tx.clientContact.update({
          where: { id: contactId },
          data: input,
          include: contactInclude,
        }),
      );
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'client_contact',
          entityId: contactId,
          before: toContact(before),
          after,
        },
        tx,
      );
      return after;
    });
  }

  async removeContact(clientId: string, contactId: string, actor: Actor): Promise<void> {
    await this.findClient(clientId, clientWriteScope(actor));
    const contact = await this.findContact(clientId, contactId);
    await this.prisma.$transaction(async (tx) => {
      await tx.clientContact.update({
        where: { id: contactId },
        data: { deletedAt: new Date(), isPrimary: false },
      });
      await this.audit.record(
        {
          action: 'DELETE',
          entity: 'client_contact',
          entityId: contactId,
          before: toContact(contact),
        },
        tx,
      );
    });
  }

  /** Creates a CLIENT_USER for the contact and emails an invitation (US-CLIENTS-02). */
  async inviteContact(clientId: string, contactId: string, actor: Actor): Promise<Contact> {
    await this.findClient(clientId, clientWriteScope(actor));
    const contact = await this.findContact(clientId, contactId);
    if (!contact.email) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTACT_EMAIL_REQUIRED',
        'Add an email address before inviting this contact.',
      );
    }
    if (contact.portalUser) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONTACT_ALREADY_INVITED',
        'This contact already has portal access.',
      );
    }
    const user = await this.users.create(
      {
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        roles: ['CLIENT_USER'],
        clientId,
      },
      actor,
    );
    const updated = await this.prisma.clientContact.update({
      where: { id: contactId },
      data: { portalUserId: user.id },
      include: contactInclude,
    });
    await this.audit.record({
      action: 'PORTAL_INVITE',
      entity: 'client_contact',
      entityId: contactId,
      after: { portalUserId: user.id },
    });
    return toContact(updated);
  }

  // ── Activities ──

  async listActivities(clientId: string, actor: Actor): Promise<Activity[]> {
    await this.findClient(clientId, clientReadScope(actor));
    const rows = await this.prisma.activity.findMany({
      where: { clientId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        createdBy: userNameSelect,
      },
    });
    return rows.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      body: a.body,
      contact: personName(a.contact),
      author: personName(a.createdBy),
      occurredAt: a.occurredAt.toISOString(),
    }));
  }

  async createActivity(clientId: string, input: ActivityInput, actor: Actor): Promise<Activity> {
    await this.findClient(clientId, clientWriteScope(actor));
    if (input.contactId) await this.findContact(clientId, input.contactId);
    const activity = await this.prisma.$transaction(async (tx) => {
      const a = await tx.activity.create({
        data: {
          clientId,
          contactId: input.contactId,
          type: input.type,
          subject: input.subject,
          body: input.body,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
          createdById: actor.id,
        },
      });
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'activity',
          entityId: a.id,
          after: { type: a.type, subject: a.subject },
        },
        tx,
      );
      return a;
    });
    return (await this.listActivities(clientId, actor)).find((a) => a.id === activity.id)!;
  }

  // ── Projects ──

  async listProjects(clientId: string, actor: Actor): Promise<Project[]> {
    await this.findClient(clientId, clientReadScope(actor));
    const rows = await this.prisma.project.findMany({
      where: { clientId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toProject);
  }

  async createProject(clientId: string, input: ProjectInput, actor: Actor): Promise<Project> {
    await this.findClient(clientId, projectWriteScope(actor));
    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed.',
        {
          fields: { endDate: ['End date must be on or after the start date.'] },
        },
      );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = toProject(
          await tx.project.create({
            data: {
              ...input,
              clientId,
              startDate: input.startDate ? toDate(input.startDate) : undefined,
              endDate: input.endDate ? toDate(input.endDate) : undefined,
              createdById: actor.id,
            },
          }),
        );
        await this.audit.record(
          { action: 'CREATE', entity: 'project', entityId: project.id, after: project },
          tx,
        );
        return project;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'PROJECT_NAME_EXISTS',
          'This client already has a project with that name.',
        );
      }
      throw error;
    }
  }

  // ── Helpers ──

  private async findClient(id: string, scope: Prisma.ClientWhereInput): Promise<ClientRow> {
    const client = await this.prisma.client.findFirst({
      where: { AND: [{ id, deletedAt: null }, scope] },
      include: clientInclude,
    });
    if (!client) throw clientNotFound();
    return client;
  }

  private async findContact(clientId: string, contactId: string) {
    const contact = await this.prisma.clientContact.findFirst({
      where: { id: contactId, clientId, deletedAt: null },
      include: contactInclude,
    });
    if (!contact) throw contactNotFound();
    return contact;
  }

  private async clearPrimary(tx: Prisma.TransactionClient, clientId: string): Promise<void> {
    await tx.clientContact.updateMany({
      where: { clientId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  /** Only a Super Admin may assign someone else; the target must be an active Account Manager. */
  private async resolveAccountManager(
    requested: string | undefined,
    actor: Actor,
  ): Promise<string> {
    if (!requested || requested === actor.id) {
      if (!hasRole(actor, 'ACCOUNT_MANAGER') && !requested) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'ACCOUNT_MANAGER_REQUIRED',
          'Choose the account manager for this client.',
        );
      }
      if (!requested) return actor.id;
    }
    if (requested !== actor.id && !hasRole(actor, 'SUPER_ADMIN')) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Only a Super Admin can assign another account manager.',
      );
    }
    const manager = await this.prisma.user.findFirst({
      where: {
        id: requested,
        status: 'ACTIVE',
        roles: { some: { role: { code: 'ACCOUNT_MANAGER' } } },
      },
      select: { id: true },
    });
    if (!manager) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_ACCOUNT_MANAGER',
        'The selected user is not an active account manager.',
      );
    }
    return manager.id;
  }

  private mapTrnConflict(error: unknown): unknown {
    return isUniqueViolation(error, 'trn')
      ? new AppException(
          HttpStatus.CONFLICT,
          'CLIENT_TRN_EXISTS',
          'Another client already uses this TRN.',
        )
      : error;
  }
}
