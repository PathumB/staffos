import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  type Invoice,
  invoiceGenerateSchema,
  invoiceIssueSchema,
  invoiceListQuerySchema,
  invoicePaidSchema,
  invoiceSchema,
  invoiceVoidSchema,
  type Paginated,
  type SignedUrl,
  signedUrlSchema,
} from '@staffos/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import {
  ApiListQuery,
  ApiZodBody,
  ApiZodOkResponse,
  createZodDto,
} from '../../common/validation/zod';
import { InvoicesService } from './invoices.service';

class ListQueryDto extends createZodDto(invoiceListQuerySchema) {}
class GenerateDto extends createZodDto(invoiceGenerateSchema) {}
class IssueDto extends createZodDto(invoiceIssueSchema) {}
class VoidDto extends createZodDto(invoiceVoidSchema) {}
class PaidDto extends createZodDto(invoicePaidSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions('invoices:read')
  @ApiListQuery(['clientId', 'status'])
  @ApiZodOkResponse(z.object({ data: z.array(invoiceSchema) }))
  list(@Query() query: ListQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Invoice>> {
    return this.invoices.list(query, actor);
  }

  @Post('generate')
  @RequirePermissions('invoices:write')
  @ApiOperation({
    summary: 'DRAFT invoice from approved timesheets (weeks starting in the period)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Repeat-safe retries' })
  @ApiUnprocessableEntityResponse({ description: 'NOTHING_TO_INVOICE' })
  @ApiConflictResponse({ description: 'IDEMPOTENCY_KEY_REUSED or CONCURRENT_CHANGE' })
  @ApiZodBody(invoiceGenerateSchema)
  @ApiZodOkResponse(invoiceSchema)
  async generate(
    @Body() body: GenerateDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Invoice> {
    if (key !== undefined && !/^[\w-]{8,100}$/.test(key)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key must be 8–100 letters, digits, dashes or underscores.',
      );
    }
    const result = await this.invoices.generate(body, key, actor);
    res.status(result.status);
    return result.body;
  }

  @Get(':id')
  @RequirePermissions('invoices:read')
  @ApiZodOkResponse(invoiceSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Invoice> {
    return this.invoices.get(id, actor);
  }

  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('invoices:write')
  @ApiOperation({ summary: 'Number it (INV-YYYY-NNNNNN), make it immutable, build the PDF' })
  @ApiZodBody(invoiceIssueSchema)
  @ApiZodOkResponse(invoiceSchema)
  issue(@Id() id: string, @Body() body: IssueDto, @CurrentActor() actor: Actor) {
    return this.invoices.issue(id, body.version, actor);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('invoices:write')
  @ApiOperation({ summary: 'Void with a reason; its timesheets return to APPROVED' })
  @ApiZodBody(invoiceVoidSchema)
  @ApiZodOkResponse(invoiceSchema)
  void(@Id() id: string, @Body() body: VoidDto, @CurrentActor() actor: Actor) {
    return this.invoices.void(id, body, actor);
  }

  @Post(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('invoices:write')
  @ApiZodBody(invoicePaidSchema)
  @ApiZodOkResponse(invoiceSchema)
  markPaid(@Id() id: string, @Body() body: PaidDto, @CurrentActor() actor: Actor) {
    return this.invoices.markPaid(id, body, actor);
  }

  @Get(':id/pdf')
  @RequirePermissions('invoices:read')
  @ApiOperation({ summary: 'Signed 5-minute link to the PDF of an issued invoice' })
  @ApiZodOkResponse(signedUrlSchema)
  pdf(@Id() id: string, @CurrentActor() actor: Actor): Promise<SignedUrl> {
    return this.invoices.pdfUrl(id, actor);
  }
}
