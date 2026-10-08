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
import { ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Job,
  jobActionSchema,
  jobCreateSchema,
  jobListQuerySchema,
  jobSchema,
  jobUpdateSchema,
  type Paginated,
  type Pipeline,
  pipelineSchema,
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
import { JobsService } from './jobs.service';

class JobListQueryDto extends createZodDto(jobListQuerySchema) {}
class JobCreateDto extends createZodDto(jobCreateSchema) {}
class JobUpdateDto extends createZodDto(jobUpdateSchema) {}
class JobActionDto extends createZodDto(jobActionSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('jobs')
@ApiConflictResponse({ description: 'INVALID_TRANSITION or STALE_VERSION' })
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @RequirePermissions('jobs:read')
  @ApiListQuery(['status', 'clientId', 'category', 'recruiterId'])
  @ApiZodOkResponse(z.object({ data: z.array(jobSchema) }))
  list(@Query() query: JobListQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Job>> {
    return this.jobs.list(query, actor);
  }

  @Post()
  @RequirePermissions('jobs:write')
  @ApiOperation({ summary: 'Open a job from an approved manpower request (DRAFT)' })
  @ApiZodBody(jobCreateSchema)
  @ApiZodOkResponse(jobSchema)
  create(@Body() body: JobCreateDto, @CurrentActor() actor: Actor): Promise<Job> {
    return this.jobs.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('jobs:read')
  @ApiZodOkResponse(jobSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Job> {
    return this.jobs.get(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('jobs:write')
  @ApiZodBody(jobUpdateSchema)
  @ApiZodOkResponse(jobSchema)
  update(@Id() id: string, @Body() body: JobUpdateDto, @CurrentActor() actor: Actor): Promise<Job> {
    return this.jobs.update(id, body, actor);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('jobs:publish')
  @ApiOperation({ summary: 'DRAFT/ON_HOLD → OPEN (visible on the careers portal)' })
  @ApiZodBody(jobActionSchema)
  @ApiZodOkResponse(jobSchema)
  publish(
    @Id() id: string,
    @Body() body: JobActionDto,
    @CurrentActor() actor: Actor,
  ): Promise<Job> {
    return this.jobs.changeStatus(id, 'publish', body.version, actor);
  }

  @Post(':id/hold')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('jobs:publish')
  @ApiZodBody(jobActionSchema)
  @ApiZodOkResponse(jobSchema)
  hold(@Id() id: string, @Body() body: JobActionDto, @CurrentActor() actor: Actor): Promise<Job> {
    return this.jobs.changeStatus(id, 'hold', body.version, actor);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('jobs:publish')
  @ApiZodBody(jobActionSchema)
  @ApiZodOkResponse(jobSchema)
  close(@Id() id: string, @Body() body: JobActionDto, @CurrentActor() actor: Actor): Promise<Job> {
    return this.jobs.changeStatus(id, 'close', body.version, actor);
  }

  @Get(':id/pipeline')
  @RequirePermissions('applications:read')
  @ApiOperation({ summary: 'Applications grouped by stage (Kanban)' })
  @ApiZodOkResponse(pipelineSchema)
  pipeline(@Id() id: string, @CurrentActor() actor: Actor): Promise<Pipeline> {
    return this.jobs.pipeline(id, actor);
  }
}
