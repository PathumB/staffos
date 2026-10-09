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
  type AutomationRule,
  automationRuleInputSchema,
  automationRuleSchema,
  automationRuleUpdateSchema,
  type AutomationRun,
  automationRunListQuerySchema,
  automationRunSchema,
  automationTestInputSchema,
  type AutomationTestResult,
  automationTestResultSchema,
  type Paginated,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { AutomationsService } from './automations.service';

class RuleDto extends createZodDto(automationRuleInputSchema) {}
class RuleUpdateDto extends createZodDto(automationRuleUpdateSchema) {}
class TestDto extends createZodDto(automationTestInputSchema) {}
class RunQueryDto extends createZodDto(automationRunListQuerySchema) {}

@ApiTags('automations')
@Controller()
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get('automation-rules')
  @RequirePermissions('automations:manage')
  @ApiZodOkResponse(z.array(automationRuleSchema))
  list(): Promise<AutomationRule[]> {
    return this.automations.list();
  }

  @Post('automation-rules')
  @RequirePermissions('automations:manage')
  @ApiOperation({ summary: 'When [event] If [conditions, AND] Then [actions]' })
  @ApiZodOkResponse(automationRuleSchema)
  create(@Body() body: RuleDto, @CurrentActor() actor: Actor): Promise<AutomationRule> {
    return this.automations.create(body, actor);
  }

  @Get('automation-rules/:id')
  @RequirePermissions('automations:manage')
  @ApiZodOkResponse(automationRuleSchema)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AutomationRule> {
    return this.automations.get(id);
  }

  @Patch('automation-rules/:id')
  @RequirePermissions('automations:manage')
  @ApiZodOkResponse(automationRuleSchema)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RuleUpdateDto,
  ): Promise<AutomationRule> {
    return this.automations.update(id, body);
  }

  @Delete('automation-rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('automations:manage')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.automations.remove(id);
  }

  @Post('automation-rules/:id/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('automations:manage')
  @ApiOperation({ summary: 'Dry run with a sample payload (nothing is executed)' })
  @ApiZodOkResponse(automationTestResultSchema)
  test(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TestDto,
  ): Promise<AutomationTestResult> {
    return this.automations.test(id, body.payload);
  }

  @Get('automation-runs')
  @RequirePermissions('automations:manage')
  @ApiOperation({ summary: 'Run log with input, result and error' })
  @ApiZodOkResponse(z.object({ data: z.array(automationRunSchema) }))
  runs(@Query() query: RunQueryDto): Promise<Paginated<AutomationRun>> {
    return this.automations.runs(query);
  }

  @Post('automation-runs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('automations:manage')
  @ApiOperation({ summary: 'Run a failed run again with the same input' })
  @ApiZodOkResponse(automationRunSchema)
  retry(@Param('id', ParseUUIDPipe) id: string): Promise<AutomationRun> {
    return this.automations.retry(id);
  }
}
