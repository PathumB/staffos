import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Approval,
  approvalListQuerySchema,
  approvalSchema,
  type Paginated,
  type Workflow,
  workflowInputSchema,
  workflowSchema,
  workflowUpdateSchema,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { AuthenticatedOnly, CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { WorkflowsService } from './workflows.service';

class WorkflowDto extends createZodDto(workflowInputSchema) {}
class WorkflowUpdateDto extends createZodDto(workflowUpdateSchema) {}
class ApprovalQueryDto extends createZodDto(approvalListQuerySchema) {}

@ApiTags('workflows')
@Controller()
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get('workflows')
  @RequirePermissions('workflows:manage')
  @ApiOperation({ summary: 'Approval chain definitions' })
  @ApiZodOkResponse(z.array(workflowSchema))
  list(): Promise<Workflow[]> {
    return this.workflows.list();
  }

  @Post('workflows')
  @RequirePermissions('workflows:manage')
  @ApiOperation({ summary: 'Define an approval chain (ordered steps, one approver role each)' })
  @ApiZodOkResponse(workflowSchema)
  create(@Body() body: WorkflowDto, @CurrentActor() actor: Actor): Promise<Workflow> {
    return this.workflows.create(body, actor);
  }

  @Get('workflows/:id')
  @RequirePermissions('workflows:manage')
  @ApiZodOkResponse(workflowSchema)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Workflow> {
    return this.workflows.get(id);
  }

  @Patch('workflows/:id')
  @RequirePermissions('workflows:manage')
  @ApiOperation({ summary: 'Rename, (de)activate or replace steps (409 while approvals pend)' })
  @ApiZodOkResponse(workflowSchema)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkflowUpdateDto,
  ): Promise<Workflow> {
    return this.workflows.update(id, body);
  }

  /** Any signed-in user: only approvals waiting on their roles (assignedTo=all needs manage). */
  @Get('approvals')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Approvals waiting on me (decide on the request or offer itself)' })
  @ApiZodOkResponse(z.object({ data: z.array(approvalSchema) }))
  approvals(
    @Query() query: ApprovalQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<Paginated<Approval>> {
    return this.workflows.approvals(query, actor);
  }
}
