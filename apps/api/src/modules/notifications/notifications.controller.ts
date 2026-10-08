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
import {
  type Notification,
  notificationListQuerySchema,
  notificationSchema,
  type Paginated,
  unreadCountSchema,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { NotificationsService } from './notifications.service';

class ListQueryDto extends createZodDto(notificationListQuerySchema) {}

/** The caller's own notifications only (US-NOTIF-01). */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions('notifications:read')
  @ApiOperation({ summary: 'My notifications, newest first (?unread=true for unread only)' })
  @ApiZodOkResponse(z.object({ data: z.array(notificationSchema) }))
  list(
    @Query() query: ListQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<Paginated<Notification>> {
    return this.notifications.list(query, actor);
  }

  @Get('unread-count')
  @RequirePermissions('notifications:read')
  @ApiOperation({ summary: 'Unread count for the bell' })
  @ApiZodOkResponse(unreadCountSchema)
  unreadCount(@CurrentActor() actor: Actor): Promise<{ count: number }> {
    return this.notifications.unreadCount(actor);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('notifications:read')
  @ApiZodOkResponse(unreadCountSchema)
  markAllRead(@CurrentActor() actor: Actor): Promise<{ count: number }> {
    return this.notifications.markAllRead(actor);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('notifications:read')
  @ApiZodOkResponse(notificationSchema)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ): Promise<Notification> {
    return this.notifications.markRead(id, actor);
  }
}
