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
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  type Offer,
  offerActionSchema,
  offerCreateSchema,
  offerListQuerySchema,
  offerSchema,
  type Paginated,
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
import { OffersService } from './offers.service';

class ListQueryDto extends createZodDto(offerListQuerySchema) {}
class CreateDto extends createZodDto(offerCreateSchema) {}
class ActionDto extends createZodDto(offerActionSchema) {}

const Id = () => Param('id', ParseUUIDPipe);
const conflict = () =>
  ApiConflictResponse({ description: 'INVALID_OFFER_TRANSITION or STALE_VERSION' });

@ApiTags('offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  @RequirePermissions('offers:read')
  @ApiListQuery(['applicationId', 'status'])
  @ApiZodOkResponse(z.object({ data: z.array(offerSchema) }))
  list(@Query() query: ListQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Offer>> {
    return this.offers.list(query, actor);
  }

  @Post()
  @RequirePermissions('offers:write')
  @ApiOperation({ summary: 'Create an offer (PENDING_APPROVAL); the hiring manager is notified' })
  @ApiConflictResponse({ description: 'OFFER_EXISTS' })
  @ApiUnprocessableEntityResponse({ description: 'APPLICATION_NOT_IN_OFFER or START_DATE_IN_PAST' })
  @ApiZodBody(offerCreateSchema)
  @ApiZodOkResponse(offerSchema)
  create(@Body() body: CreateDto, @CurrentActor() actor: Actor): Promise<Offer> {
    return this.offers.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('offers:read')
  @ApiZodOkResponse(offerSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Offer> {
    return this.offers.get(id, actor);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offers:approve')
  @ApiOperation({ summary: "Approve (the job's hiring manager or an HR Manager)" })
  @ApiForbiddenResponse({ description: 'NOT_OFFER_APPROVER' })
  @conflict()
  @ApiZodBody(offerActionSchema)
  @ApiZodOkResponse(offerSchema)
  approve(@Id() id: string, @Body() body: ActionDto, @CurrentActor() actor: Actor) {
    return this.offers.act(id, 'approve', body, actor);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offers:approve')
  @ApiForbiddenResponse({ description: 'NOT_OFFER_APPROVER' })
  @conflict()
  @ApiZodBody(offerActionSchema)
  @ApiZodOkResponse(offerSchema)
  reject(@Id() id: string, @Body() body: ActionDto, @CurrentActor() actor: Actor) {
    return this.offers.act(id, 'reject', body, actor);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offers:write')
  @ApiOperation({ summary: 'Mark the approved offer as sent to the candidate' })
  @conflict()
  @ApiZodBody(offerActionSchema)
  @ApiZodOkResponse(offerSchema)
  send(@Id() id: string, @Body() body: ActionDto, @CurrentActor() actor: Actor) {
    return this.offers.act(id, 'send', body, actor);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offers:write')
  @ApiOperation({ summary: "Record the candidate's acceptance" })
  @conflict()
  @ApiZodBody(offerActionSchema)
  @ApiZodOkResponse(offerSchema)
  accept(@Id() id: string, @Body() body: ActionDto, @CurrentActor() actor: Actor) {
    return this.offers.act(id, 'accept', body, actor);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offers:write')
  @conflict()
  @ApiZodBody(offerActionSchema)
  @ApiZodOkResponse(offerSchema)
  decline(@Id() id: string, @Body() body: ActionDto, @CurrentActor() actor: Actor) {
    return this.offers.act(id, 'decline', body, actor);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offers:write')
  @conflict()
  @ApiZodBody(offerActionSchema)
  @ApiZodOkResponse(offerSchema)
  withdraw(@Id() id: string, @Body() body: ActionDto, @CurrentActor() actor: Actor) {
    return this.offers.act(id, 'withdraw', body, actor);
  }
}
