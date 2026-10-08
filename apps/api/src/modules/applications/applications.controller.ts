import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  type Application,
  applicationCreateSchema,
  applicationListQuerySchema,
  applicationSchema,
  type Paginated,
  transitionSchema,
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
import { ApplicationsService } from './applications.service';

class ListQueryDto extends createZodDto(applicationListQuerySchema) {}
class CreateDto extends createZodDto(applicationCreateSchema) {}
class TransitionDto extends createZodDto(transitionSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @RequirePermissions('applications:read')
  @ApiListQuery(['jobId', 'candidateId', 'stage'])
  @ApiZodOkResponse(z.object({ data: z.array(applicationSchema) }))
  list(
    @Query() query: ListQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<Paginated<Application>> {
    return this.applications.list(query, actor);
  }

  @Post()
  @RequirePermissions('applications:transition')
  @ApiOperation({ summary: 'Add a candidate to an open job (stage APPLIED)' })
  @ApiConflictResponse({ description: 'ALREADY_APPLIED' })
  @ApiZodBody(applicationCreateSchema)
  @ApiZodOkResponse(applicationSchema)
  create(@Body() body: CreateDto, @CurrentActor() actor: Actor): Promise<Application> {
    return this.applications.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('applications:read')
  @ApiOperation({ summary: 'Application with its stage history' })
  @ApiZodOkResponse(applicationSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Application> {
    return this.applications.get(id, actor);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('applications:transition')
  @ApiOperation({ summary: 'Move one stage forward, or reject/withdraw (reason required)' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION or STALE_VERSION' })
  @ApiUnprocessableEntityResponse({
    description: 'OFFER_NOT_ACCEPTED (hiring needs an accepted offer)',
  })
  @ApiZodBody(transitionSchema)
  @ApiZodOkResponse(applicationSchema)
  transition(
    @Id() id: string,
    @Body() body: TransitionDto,
    @CurrentActor() actor: Actor,
  ): Promise<Application> {
    return this.applications.transition(id, body, actor);
  }
}
