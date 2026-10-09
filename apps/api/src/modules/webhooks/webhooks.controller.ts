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
  type Paginated,
  type Webhook,
  type WebhookDelivery,
  webhookDeliveryListQuerySchema,
  webhookDeliverySchema,
  webhookInputSchema,
  webhookSchema,
  webhookUpdateSchema,
  type WebhookWithSecret,
  webhookWithSecretSchema,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { WebhooksService } from './webhooks.service';

class WebhookDto extends createZodDto(webhookInputSchema) {}
class WebhookUpdateDto extends createZodDto(webhookUpdateSchema) {}
class DeliveryQueryDto extends createZodDto(webhookDeliveryListQuerySchema) {}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @RequirePermissions('webhooks:manage')
  @ApiZodOkResponse(z.array(webhookSchema))
  list(): Promise<Webhook[]> {
    return this.webhooks.list();
  }

  @Post()
  @RequirePermissions('webhooks:manage')
  @ApiOperation({ summary: 'Register an https endpoint; the signing secret is shown only once' })
  @ApiZodOkResponse(webhookWithSecretSchema)
  create(@Body() body: WebhookDto, @CurrentActor() actor: Actor): Promise<WebhookWithSecret> {
    return this.webhooks.create(body, actor);
  }

  @Patch(':id')
  @RequirePermissions('webhooks:manage')
  @ApiZodOkResponse(webhookSchema)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: WebhookUpdateDto): Promise<Webhook> {
    return this.webhooks.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('webhooks:manage')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.webhooks.remove(id);
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('webhooks:manage')
  @ApiOperation({ summary: 'Replace the signing secret (old one stops working at once)' })
  @ApiZodOkResponse(webhookWithSecretSchema)
  rotate(@Param('id', ParseUUIDPipe) id: string): Promise<WebhookWithSecret> {
    return this.webhooks.rotateSecret(id);
  }

  @Get(':id/deliveries')
  @RequirePermissions('webhooks:manage')
  @ApiOperation({ summary: 'Delivery log: status, attempts, response code' })
  @ApiZodOkResponse(z.object({ data: z.array(webhookDeliverySchema) }))
  deliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeliveryQueryDto,
  ): Promise<Paginated<WebhookDelivery>> {
    return this.webhooks.deliveries(id, query);
  }

  @Post('deliveries/:id/redeliver')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('webhooks:manage')
  @ApiOperation({ summary: 'Send the same payload again as a new delivery' })
  @ApiZodOkResponse(webhookDeliverySchema)
  redeliver(@Param('id', ParseUUIDPipe) id: string): Promise<WebhookDelivery> {
    return this.webhooks.redeliver(id);
  }
}
