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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  type Document,
  documentListQuerySchema,
  documentSchema,
  documentUpdateSchema,
  documentUploadSchema,
  expiringQuerySchema,
  MAX_UPLOAD_BYTES,
  type SignedUrl,
  signedUrlSchema,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { ApiZodBody, ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import type { UploadedFile as File } from './document.rules';
import { DocumentsService } from './documents.service';

class ListQueryDto extends createZodDto(documentListQuerySchema) {}
class UploadDto extends createZodDto(documentUploadSchema) {}
class UpdateDto extends createZodDto(documentUpdateSchema) {}
class ExpiringQueryDto extends createZodDto(expiringQuerySchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions('documents:read')
  @ApiOperation({ summary: "An owner's documents (identity types only with read-identity)" })
  @ApiZodOkResponse(z.array(documentSchema))
  list(@Query() query: ListQueryDto, @CurrentActor() actor: Actor): Promise<Document[]> {
    return this.documents.list(query, actor);
  }

  @Get('expiring')
  @RequirePermissions('documents:read-identity')
  @ApiOperation({ summary: 'Employee documents expiring within N days (default 30) or expired' })
  @ApiZodOkResponse(z.array(documentSchema))
  expiring(@Query() query: ExpiringQueryDto, @CurrentActor() actor: Actor): Promise<Document[]> {
    return this.documents.expiring(query.withinDays, actor);
  }

  @Post()
  @RequirePermissions('documents:write')
  @UseInterceptors(
    // No storage option = multer's memory storage (max 10 MB): bytes are type-checked before
    // anything is written.
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload (pdf, docx, jpg, png; max 10 MB) with metadata' })
  @ApiForbiddenResponse({ description: 'IDENTITY_DOCUMENT_FORBIDDEN' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_FILE' })
  @ApiZodOkResponse(documentSchema)
  upload(
    @Body() body: UploadDto,
    @UploadedFile() file: File | undefined,
    @CurrentActor() actor: Actor,
  ): Promise<Document> {
    return this.documents.upload(body, file, actor);
  }

  @Get(':id/url')
  @RequirePermissions('documents:read')
  @ApiOperation({ summary: 'Signed download URL valid for 5 minutes; audited as DOCUMENT_VIEWED' })
  @ApiForbiddenResponse({ description: 'IDENTITY_DOCUMENT_FORBIDDEN' })
  @ApiZodOkResponse(signedUrlSchema)
  url(@Id() id: string, @CurrentActor() actor: Actor): Promise<SignedUrl> {
    return this.documents.signedUrl(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('documents:write')
  @ApiOperation({ summary: 'Metadata only (type, number, dates)' })
  @ApiZodBody(documentUpdateSchema)
  @ApiZodOkResponse(documentSchema)
  update(@Id() id: string, @Body() body: UpdateDto, @CurrentActor() actor: Actor) {
    return this.documents.update(id, body, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('documents:write')
  @ApiNoContentResponse()
  remove(@Id() id: string, @CurrentActor() actor: Actor): Promise<void> {
    return this.documents.remove(id, actor);
  }
}
