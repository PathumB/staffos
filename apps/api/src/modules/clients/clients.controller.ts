import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Activity,
  activityInputSchema,
  activitySchema,
  type Client,
  clientInputSchema,
  clientListQuerySchema,
  clientSchema,
  clientUpdateSchema,
  type Contact,
  contactInputSchema,
  contactSchema,
  type Paginated,
  type Project,
  projectInputSchema,
  projectSchema,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import {
  ApiListQuery,
  ApiZodBody,
  ApiZodOkResponse,
  createZodDto,
} from '../../common/validation/zod';
import { ClientsService } from './clients.service';

class ClientListQueryDto extends createZodDto(clientListQuerySchema) {}
class ClientInputDto extends createZodDto(clientInputSchema) {}
class ClientUpdateDto extends createZodDto(clientUpdateSchema) {}
class ContactInputDto extends createZodDto(contactInputSchema) {}
class ContactUpdateDto extends createZodDto(contactInputSchema.partial()) {}
class ActivityInputDto extends createZodDto(activityInputSchema) {}
class ProjectInputDto extends createZodDto(projectInputSchema) {}

const Id = () => Param('id', ParseUUIDPipe);
const ContactId = () => Param('contactId', ParseUUIDPipe);

/** CRM clients, contacts, activities and projects (docs/api-contract.md §2.4). Scoped in the service. */
@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermissions('clients:read')
  @ApiListQuery(['industry', 'status', 'accountManagerId'])
  @ApiZodOkResponse(z.object({ data: z.array(clientSchema) }))
  list(
    @Query() query: ClientListQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<Paginated<Client>> {
    return this.clients.list(query, actor);
  }

  @Post()
  @RequirePermissions('clients:write')
  @ApiOperation({ summary: 'Create a client (the creator becomes its account manager)' })
  @ApiZodBody(clientInputSchema)
  @ApiZodOkResponse(clientSchema)
  create(@Body() body: ClientInputDto, @CurrentActor() actor: Actor): Promise<Client> {
    return this.clients.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('clients:read')
  @ApiZodOkResponse(clientSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Client> {
    return this.clients.get(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('clients:write')
  @ApiZodBody(clientUpdateSchema)
  @ApiZodOkResponse(clientSchema)
  update(
    @Id() id: string,
    @Body() body: ClientUpdateDto,
    @CurrentActor() actor: Actor,
  ): Promise<Client> {
    return this.clients.update(id, body, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('clients:write')
  @ApiOperation({ summary: 'Archive a client (soft delete; 409 with active deployments)' })
  remove(@Id() id: string, @CurrentActor() actor: Actor): Promise<void> {
    return this.clients.remove(id, actor);
  }

  @Get(':id/contacts')
  @RequirePermissions('clients:read')
  @ApiZodOkResponse(z.array(contactSchema))
  contacts(@Id() id: string, @CurrentActor() actor: Actor): Promise<Contact[]> {
    return this.clients.listContacts(id, actor);
  }

  @Post(':id/contacts')
  @RequirePermissions('clients:write')
  @ApiZodBody(contactInputSchema)
  @ApiZodOkResponse(contactSchema)
  createContact(
    @Id() id: string,
    @Body() body: ContactInputDto,
    @CurrentActor() actor: Actor,
  ): Promise<Contact> {
    return this.clients.createContact(id, body, actor);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermissions('clients:write')
  @ApiZodBody(contactInputSchema.partial())
  @ApiZodOkResponse(contactSchema)
  updateContact(
    @Id() id: string,
    @ContactId() contactId: string,
    @Body() body: ContactUpdateDto,
    @CurrentActor() actor: Actor,
  ): Promise<Contact> {
    return this.clients.updateContact(id, contactId, body, actor);
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('clients:write')
  removeContact(
    @Id() id: string,
    @ContactId() contactId: string,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.clients.removeContact(id, contactId, actor);
  }

  @Post(':id/contacts/:contactId/invite')
  @RequirePermissions('clients:write')
  @ApiOperation({
    summary: 'Give the contact client-portal access (creates a CLIENT_USER and emails an invite)',
  })
  @ApiZodOkResponse(contactSchema)
  invite(
    @Id() id: string,
    @ContactId() contactId: string,
    @CurrentActor() actor: Actor,
  ): Promise<Contact> {
    return this.clients.inviteContact(id, contactId, actor);
  }

  @Get(':id/activities')
  @RequirePermissions('clients:read')
  @ApiZodOkResponse(z.array(activitySchema))
  activities(@Id() id: string, @CurrentActor() actor: Actor): Promise<Activity[]> {
    return this.clients.listActivities(id, actor);
  }

  @Post(':id/activities')
  @RequirePermissions('clients:write')
  @ApiZodBody(activityInputSchema)
  @ApiZodOkResponse(activitySchema)
  createActivity(
    @Id() id: string,
    @Body() body: ActivityInputDto,
    @CurrentActor() actor: Actor,
  ): Promise<Activity> {
    return this.clients.createActivity(id, body, actor);
  }

  @Get(':id/projects')
  @RequirePermissions('clients:read')
  @ApiZodOkResponse(z.array(projectSchema))
  projects(@Id() id: string, @CurrentActor() actor: Actor): Promise<Project[]> {
    return this.clients.listProjects(id, actor);
  }

  @Post(':id/projects')
  @RequirePermissions('deployments:write')
  @ApiZodBody(projectInputSchema)
  @ApiZodOkResponse(projectSchema)
  createProject(
    @Id() id: string,
    @Body() body: ProjectInputDto,
    @CurrentActor() actor: Actor,
  ): Promise<Project> {
    return this.clients.createProject(id, body, actor);
  }
}
