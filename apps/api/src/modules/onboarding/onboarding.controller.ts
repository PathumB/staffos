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
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type OnboardingPlan,
  onboardingPlanSchema,
  type OnboardingTemplate,
  type Paginated,
  planListQuerySchema,
  taskCompleteSchema,
  taskUpdateSchema,
  templateInputSchema,
  templateSchema,
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
import { OnboardingService } from './onboarding.service';

class TemplateDto extends createZodDto(templateInputSchema) {}
class PlanQueryDto extends createZodDto(planListQuerySchema) {}
class CompleteDto extends createZodDto(taskCompleteSchema) {}
class TaskUpdateDto extends createZodDto(taskUpdateSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('onboarding')
@Controller()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('onboarding-templates')
  @RequirePermissions('onboarding-templates:manage')
  @ApiZodOkResponse(z.array(templateSchema))
  listTemplates(): Promise<OnboardingTemplate[]> {
    return this.onboarding.listTemplates();
  }

  @Post('onboarding-templates')
  @RequirePermissions('onboarding-templates:manage')
  @ApiConflictResponse({ description: 'TEMPLATE_CATEGORY_EXISTS' })
  @ApiZodBody(templateInputSchema)
  @ApiZodOkResponse(templateSchema)
  createTemplate(@Body() body: TemplateDto, @CurrentActor() actor: Actor) {
    return this.onboarding.saveTemplate(body, actor);
  }

  @Get('onboarding-templates/:id')
  @RequirePermissions('onboarding-templates:manage')
  @ApiZodOkResponse(templateSchema)
  getTemplate(@Id() id: string): Promise<OnboardingTemplate> {
    return this.onboarding.getTemplate(id);
  }

  @Patch('onboarding-templates/:id')
  @RequirePermissions('onboarding-templates:manage')
  @ApiOperation({ summary: 'Replace the template; existing plans keep their copied tasks' })
  @ApiConflictResponse({ description: 'TEMPLATE_CATEGORY_EXISTS' })
  @ApiZodBody(templateInputSchema)
  @ApiZodOkResponse(templateSchema)
  updateTemplate(@Id() id: string, @Body() body: TemplateDto, @CurrentActor() actor: Actor) {
    return this.onboarding.saveTemplate(body, actor, id);
  }

  @Delete('onboarding-templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('onboarding-templates:manage')
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'TEMPLATE_IN_USE (deactivate instead)' })
  deleteTemplate(@Id() id: string): Promise<void> {
    return this.onboarding.deleteTemplate(id);
  }

  @Get('onboarding-plans')
  @RequirePermissions('onboarding:read')
  @ApiListQuery(['status', 'employeeId'])
  @ApiZodOkResponse(z.object({ data: z.array(onboardingPlanSchema) }))
  listPlans(
    @Query() query: PlanQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<Paginated<OnboardingPlan>> {
    return this.onboarding.listPlans(query, actor);
  }

  @Get('onboarding-plans/:id')
  @RequirePermissions('onboarding:read')
  @ApiOperation({ summary: 'Plan with tasks; `canComplete` says what the caller may tick off' })
  @ApiZodOkResponse(onboardingPlanSchema)
  getPlan(@Id() id: string, @CurrentActor() actor: Actor): Promise<OnboardingPlan> {
    return this.onboarding.getPlan(id, actor);
  }

  @Post('onboarding-tasks/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding:write')
  @ApiOperation({ summary: 'Complete a task; the last required one completes the plan' })
  @ApiForbiddenResponse({ description: 'TASK_NOT_ASSIGNED_TO_YOU' })
  @ApiConflictResponse({ description: 'TASK_ALREADY_DONE or PLAN_NOT_ACTIVE' })
  @ApiZodBody(taskCompleteSchema)
  @ApiZodOkResponse(onboardingPlanSchema)
  complete(@Id() id: string, @Body() body: CompleteDto, @CurrentActor() actor: Actor) {
    return this.onboarding.completeTask(id, body, actor);
  }

  @Post('onboarding-tasks/:id/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding:write')
  @ApiForbiddenResponse({ description: 'HR Managers only' })
  @ApiZodOkResponse(onboardingPlanSchema)
  reopen(@Id() id: string, @CurrentActor() actor: Actor) {
    return this.onboarding.reopenTask(id, actor);
  }

  @Patch('onboarding-tasks/:id')
  @RequirePermissions('onboarding:write')
  @ApiOperation({ summary: 'HR: reassign or change the due date' })
  @ApiForbiddenResponse({ description: 'HR Managers only' })
  @ApiZodBody(taskUpdateSchema)
  @ApiZodOkResponse(onboardingPlanSchema)
  updateTask(@Id() id: string, @Body() body: TaskUpdateDto, @CurrentActor() actor: Actor) {
    return this.onboarding.updateTask(id, body, actor);
  }
}
