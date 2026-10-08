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
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  type Feedback,
  feedbackInputSchema,
  feedbackSchema,
  type Interview,
  interviewCancelSchema,
  interviewCreateSchema,
  interviewListQuerySchema,
  interviewSchema,
  interviewUpdateSchema,
  type Paginated,
  type PanelOption,
  panelOptionSchema,
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
import { InterviewsService } from './interviews.service';

class ListQueryDto extends createZodDto(interviewListQuerySchema) {}
class CreateDto extends createZodDto(interviewCreateSchema) {}
class UpdateDto extends createZodDto(interviewUpdateSchema) {}
class CancelDto extends createZodDto(interviewCancelSchema) {}
class FeedbackDto extends createZodDto(feedbackInputSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('interviews')
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get()
  @RequirePermissions('applications:read')
  @ApiOperation({ summary: 'Interviews you may see (recruiters, hiring manager, panel members)' })
  @ApiListQuery(['applicationId', 'interviewerId', 'status'])
  @ApiZodOkResponse(z.object({ data: z.array(interviewSchema) }))
  list(@Query() query: ListQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Interview>> {
    return this.interviews.list(query, actor);
  }

  @Post()
  @RequirePermissions('interviews:write')
  @ApiOperation({ summary: 'Schedule an interview; candidate and panel get an .ics invite' })
  @ApiUnprocessableEntityResponse({
    description: 'APPLICATION_NOT_IN_INTERVIEW, INVALID_INTERVIEWER or INTERVIEW_IN_PAST',
  })
  @ApiZodBody(interviewCreateSchema)
  @ApiZodOkResponse(interviewSchema)
  create(@Body() body: CreateDto, @CurrentActor() actor: Actor): Promise<Interview> {
    return this.interviews.create(body, actor);
  }

  @Get('panel-options')
  @RequirePermissions('interviews:write')
  @ApiOperation({ summary: 'Active users who can interview (id, name, role)' })
  @ApiZodOkResponse(z.array(panelOptionSchema))
  panelOptions(): Promise<PanelOption[]> {
    return this.interviews.panelOptions();
  }

  @Get(':id')
  @RequirePermissions('applications:read')
  @ApiZodOkResponse(interviewSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Interview> {
    return this.interviews.get(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('interviews:write')
  @ApiOperation({ summary: 'Reschedule or change the panel; re-sends the invite' })
  @ApiConflictResponse({ description: 'INTERVIEW_NOT_SCHEDULED' })
  @ApiZodBody(interviewUpdateSchema)
  @ApiZodOkResponse(interviewSchema)
  update(
    @Id() id: string,
    @Body() body: UpdateDto,
    @CurrentActor() actor: Actor,
  ): Promise<Interview> {
    return this.interviews.update(id, body, actor);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('interviews:write')
  @ApiConflictResponse({ description: 'INTERVIEW_NOT_SCHEDULED' })
  @ApiZodBody(interviewCancelSchema)
  @ApiZodOkResponse(interviewSchema)
  cancel(
    @Id() id: string,
    @Body() body: CancelDto,
    @CurrentActor() actor: Actor,
  ): Promise<Interview> {
    return this.interviews.cancel(id, body.reason, actor);
  }

  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('interview-feedback:write')
  @ApiOperation({ summary: 'Submit or edit (within 24 h) your scorecard' })
  @ApiForbiddenResponse({ description: 'NOT_AN_INTERVIEWER' })
  @ApiConflictResponse({ description: 'FEEDBACK_LOCKED or INTERVIEW_NOT_SCHEDULED' })
  @ApiZodBody(feedbackInputSchema)
  @ApiZodOkResponse(feedbackSchema)
  submitFeedback(
    @Id() id: string,
    @Body() body: FeedbackDto,
    @CurrentActor() actor: Actor,
  ): Promise<Feedback> {
    return this.interviews.submitFeedback(id, body, actor);
  }

  @Get(':id/feedback')
  @RequirePermissions('applications:read')
  @ApiOperation({ summary: 'Scorecards (panel members see only their own)' })
  @ApiZodOkResponse(z.array(feedbackSchema))
  listFeedback(@Id() id: string, @CurrentActor() actor: Actor): Promise<Feedback[]> {
    return this.interviews.listFeedback(id, actor);
  }
}
