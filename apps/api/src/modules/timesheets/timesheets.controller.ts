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
import { ApiBadRequestResponse, ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  bulkApproveSchema,
  bulkResultSchema,
  type Paginated,
  type Timesheet,
  timesheetActionSchema,
  timesheetCreateSchema,
  timesheetListQuerySchema,
  timesheetRejectSchema,
  timesheetSchema,
  timesheetUpdateSchema,
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
import { TimesheetsService } from './timesheets.service';

class ListQueryDto extends createZodDto(timesheetListQuerySchema) {}
class CreateDto extends createZodDto(timesheetCreateSchema) {}
class UpdateDto extends createZodDto(timesheetUpdateSchema) {}
class ActionDto extends createZodDto(timesheetActionSchema) {}
class RejectDto extends createZodDto(timesheetRejectSchema) {}
class BulkDto extends createZodDto(bulkApproveSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('timesheets')
@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get()
  @RequirePermissions('timesheets:read')
  @ApiListQuery(['status', 'clientId', 'employeeId', 'weekStart'])
  @ApiZodOkResponse(z.object({ data: z.array(timesheetSchema) }))
  list(@Query() query: ListQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Timesheet>> {
    return this.timesheets.list(query, actor);
  }

  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('timesheets:approve')
  @ApiOperation({ summary: 'Approve several submitted timesheets; per-id results' })
  @ApiZodBody(bulkApproveSchema)
  @ApiZodOkResponse(bulkResultSchema)
  bulkApprove(@Body() body: BulkDto, @CurrentActor() actor: Actor) {
    return this.timesheets.bulkApprove(body.ids, actor);
  }

  @Get(':id')
  @RequirePermissions('timesheets:read')
  @ApiZodOkResponse(timesheetSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Timesheet> {
    return this.timesheets.get(id, actor);
  }

  @Post()
  @RequirePermissions('timesheets:write')
  @ApiOperation({ summary: 'Start a week (DRAFT); minutes per day, 0–960' })
  @ApiBadRequestResponse({
    description: 'INVALID_WEEK, WEEK_OUTSIDE_DEPLOYMENT, INVALID_ENTRY_DATE',
  })
  @ApiConflictResponse({ description: 'TIMESHEET_EXISTS' })
  @ApiZodBody(timesheetCreateSchema)
  @ApiZodOkResponse(timesheetSchema)
  create(@Body() body: CreateDto, @CurrentActor() actor: Actor): Promise<Timesheet> {
    return this.timesheets.create(body, actor);
  }

  @Patch(':id')
  @RequirePermissions('timesheets:write')
  @ApiConflictResponse({ description: 'TIMESHEET_LOCKED or STALE_VERSION' })
  @ApiZodBody(timesheetUpdateSchema)
  @ApiZodOkResponse(timesheetSchema)
  update(@Id() id: string, @Body() body: UpdateDto, @CurrentActor() actor: Actor) {
    return this.timesheets.update(id, body, actor);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('timesheets:write')
  @ApiZodBody(timesheetActionSchema)
  @ApiZodOkResponse(timesheetSchema)
  submit(@Id() id: string, @Body() body: ActionDto, @CurrentActor() actor: Actor) {
    return this.timesheets.submit(id, body.version, actor);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('timesheets:approve')
  @ApiConflictResponse({ description: 'INVALID_TIMESHEET_TRANSITION or STALE_VERSION' })
  @ApiZodBody(timesheetActionSchema)
  @ApiZodOkResponse(timesheetSchema)
  approve(@Id() id: string, @Body() body: ActionDto, @CurrentActor() actor: Actor) {
    return this.timesheets.approve(id, body.version, actor);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('timesheets:approve')
  @ApiZodBody(timesheetRejectSchema)
  @ApiZodOkResponse(timesheetSchema)
  reject(@Id() id: string, @Body() body: RejectDto, @CurrentActor() actor: Actor) {
    return this.timesheets.reject(id, body, actor);
  }
}
