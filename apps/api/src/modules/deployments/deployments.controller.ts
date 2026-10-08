import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  type Deployment,
  deploymentCreateSchema,
  deploymentEndSchema,
  deploymentListQuerySchema,
  deploymentSchema,
  deploymentUpdateSchema,
  type Paginated,
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
import { DeploymentsService } from './deployments.service';

class ListQueryDto extends createZodDto(deploymentListQuerySchema) {}
class CreateDto extends createZodDto(deploymentCreateSchema) {}
class UpdateDto extends createZodDto(deploymentUpdateSchema) {}
class EndDto extends createZodDto(deploymentEndSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('deployments')
@Controller('deployments')
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Get()
  @RequirePermissions('deployments:read')
  @ApiListQuery(['clientId', 'projectId', 'employeeId', 'status'])
  @ApiZodOkResponse(z.object({ data: z.array(deploymentSchema) }))
  list(@Query() query: ListQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Deployment>> {
    return this.deployments.list(query, actor);
  }

  @Get(':id')
  @RequirePermissions('deployments:read')
  @ApiZodOkResponse(deploymentSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Deployment> {
    return this.deployments.get(id, actor);
  }

  @Post()
  @RequirePermissions('deployments:write')
  @ApiOperation({ summary: 'Deploy an employee to a client project (bill rate per hour, fils)' })
  @ApiConflictResponse({ description: 'DEPLOYMENT_OVERLAP' })
  @ApiUnprocessableEntityResponse({
    description: 'ONBOARDING_INCOMPLETE (HR Manager may override with a reason)',
  })
  @ApiZodBody(deploymentCreateSchema)
  @ApiZodOkResponse(deploymentSchema)
  create(@Body() body: CreateDto, @CurrentActor() actor: Actor): Promise<Deployment> {
    return this.deployments.create(body, actor);
  }

  @Patch(':id')
  @RequirePermissions('deployments:write')
  @ApiConflictResponse({ description: 'STALE_VERSION, DEPLOYMENT_OVERLAP or DEPLOYMENT_CLOSED' })
  @ApiZodBody(deploymentUpdateSchema)
  @ApiZodOkResponse(deploymentSchema)
  update(@Id() id: string, @Body() body: UpdateDto, @CurrentActor() actor: Actor) {
    return this.deployments.update(id, body, actor);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('deployments:write')
  @ApiOperation({ summary: 'End (or cancel, before it starts) with a reason' })
  @ApiZodBody(deploymentEndSchema)
  @ApiZodOkResponse(deploymentSchema)
  end(@Id() id: string, @Body() body: EndDto, @CurrentActor() actor: Actor) {
    return this.deployments.end(id, body, actor);
  }
}
