import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated, type Task, taskListQuerySchema, taskSchema } from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { AuthenticatedOnly, CurrentActor } from '../../common/auth/decorators';
import { ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { TasksService } from './tasks.service';

class TaskQueryDto extends createZodDto(taskListQuerySchema) {}

/** Any signed-in user, own tasks only (assigned to me or to one of my roles). */
@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'My task inbox, soonest due first' })
  @ApiZodOkResponse(z.object({ data: z.array(taskSchema) }))
  list(@Query() query: TaskQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Task>> {
    return this.tasks.list(query, actor);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @AuthenticatedOnly()
  @ApiZodOkResponse(taskSchema)
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor): Promise<Task> {
    return this.tasks.complete(id, actor);
  }
}
