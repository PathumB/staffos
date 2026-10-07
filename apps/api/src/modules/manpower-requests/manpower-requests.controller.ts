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
  cancellationSchema,
  decisionSchema,
  type ManpowerRequest,
  manpowerRequestInputSchema,
  manpowerRequestListQuerySchema,
  manpowerRequestSchema,
  manpowerRequestUpdateSchema,
  type Paginated,
  rejectionSchema,
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
import { ManpowerRequestsService } from './manpower-requests.service';

class ListQueryDto extends createZodDto(manpowerRequestListQuerySchema) {}
class InputDto extends createZodDto(manpowerRequestInputSchema) {}
class UpdateDto extends createZodDto(manpowerRequestUpdateSchema) {}
class DecisionDto extends createZodDto(decisionSchema) {}
class RejectionDto extends createZodDto(rejectionSchema) {}
class CancellationDto extends createZodDto(cancellationSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

/** State changes are explicit action endpoints with server-side rules (CLAUDE.md §7). */
@ApiTags('manpower-requests')
@ApiConflictResponse({ description: 'INVALID_TRANSITION or STALE_VERSION' })
@Controller('manpower-requests')
export class ManpowerRequestsController {
  constructor(private readonly requests: ManpowerRequestsService) {}

  @Get()
  @RequirePermissions('manpower-requests:read')
  @ApiListQuery(['status', 'clientId', 'category'])
  @ApiZodOkResponse(z.object({ data: z.array(manpowerRequestSchema) }))
  list(
    @Query() query: ListQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<Paginated<ManpowerRequest>> {
    return this.requests.list(query, actor);
  }

  @Post()
  @RequirePermissions('manpower-requests:write')
  @ApiOperation({
    summary: 'Log a request (DRAFT; client-portal users → SUBMITTED for their own company)',
  })
  @ApiZodBody(manpowerRequestInputSchema)
  @ApiZodOkResponse(manpowerRequestSchema)
  create(@Body() body: InputDto, @CurrentActor() actor: Actor): Promise<ManpowerRequest> {
    return this.requests.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('manpower-requests:read')
  @ApiZodOkResponse(manpowerRequestSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<ManpowerRequest> {
    return this.requests.get(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('manpower-requests:write')
  @ApiOperation({ summary: 'Edit while DRAFT or SUBMITTED' })
  @ApiZodBody(manpowerRequestUpdateSchema)
  @ApiZodOkResponse(manpowerRequestSchema)
  update(
    @Id() id: string,
    @Body() body: UpdateDto,
    @CurrentActor() actor: Actor,
  ): Promise<ManpowerRequest> {
    return this.requests.update(id, body, actor);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manpower-requests:write')
  @ApiOperation({ summary: 'Submit: headcount ≤ threshold → APPROVED, otherwise PENDING_APPROVAL' })
  @ApiZodBody(decisionSchema)
  @ApiZodOkResponse(manpowerRequestSchema)
  submit(
    @Id() id: string,
    @Body() body: DecisionDto,
    @CurrentActor() actor: Actor,
  ): Promise<ManpowerRequest> {
    return this.requests.submit(id, body.version, actor);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manpower-requests:approve')
  @ApiZodBody(decisionSchema)
  @ApiZodOkResponse(manpowerRequestSchema)
  approve(
    @Id() id: string,
    @Body() body: DecisionDto,
    @CurrentActor() actor: Actor,
  ): Promise<ManpowerRequest> {
    return this.requests.approve(id, body.version, body.comment, actor);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manpower-requests:approve')
  @ApiZodBody(rejectionSchema)
  @ApiZodOkResponse(manpowerRequestSchema)
  reject(
    @Id() id: string,
    @Body() body: RejectionDto,
    @CurrentActor() actor: Actor,
  ): Promise<ManpowerRequest> {
    return this.requests.reject(id, body.version, body.comment, actor);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manpower-requests:write')
  @ApiZodBody(cancellationSchema)
  @ApiZodOkResponse(manpowerRequestSchema)
  cancel(
    @Id() id: string,
    @Body() body: CancellationDto,
    @CurrentActor() actor: Actor,
  ): Promise<ManpowerRequest> {
    return this.requests.cancel(id, body.version, body.reason, actor);
  }
}
