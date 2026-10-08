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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  aiRequestListQuerySchema,
  aiRequestSchema,
  aiUsageSchema,
  cvParseResponseSchema,
  interviewKitInputSchema,
  interviewKitSchema,
  interviewSummarySchema,
  jdDraftInputSchema,
  jdDraftResponseSchema,
  MAX_UPLOAD_BYTES,
  matchResultSchema,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { ApiZodBody, ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import type { UploadedFile as File } from '../documents/document.rules';
import { AiService } from './ai.service';

class JdDto extends createZodDto(jdDraftInputSchema) {}
class KitDto extends createZodDto(interviewKitInputSchema) {}
class RequestsQueryDto extends createZodDto(aiRequestListQuerySchema) {}

/** security.md §2: AI endpoints are limited to 20 calls per minute. */
const AI_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const unavailable = () =>
  ApiUnprocessableEntityResponse({
    description: 'AI_UNAVAILABLE (provider down or budget reached)',
  });

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('cv-parse')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ai:use', 'candidates:write')
  @Throttle(AI_LIMIT)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a CV (pdf/docx) and get a suggested profile plus a token to attach it',
  })
  @ApiZodOkResponse(cvParseResponseSchema)
  parseCv(@UploadedFile() file: File | undefined, @CurrentActor() actor: Actor) {
    return this.ai.parseCv(file, actor);
  }

  @Post('match/:jobId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ai:use', 'applications:read')
  @Throttle(AI_LIMIT)
  @ApiOperation({ summary: 'Rank active applications: pre-score + LLM adjustment (±10)' })
  @ApiZodOkResponse(z.array(matchResultSchema))
  match(@Param('jobId', ParseUUIDPipe) jobId: string, @CurrentActor() actor: Actor) {
    return this.ai.match(jobId, actor);
  }

  @Get('match/:jobId')
  @RequirePermissions('ai:use', 'applications:read')
  @ApiZodOkResponse(z.array(matchResultSchema))
  matchResults(@Param('jobId', ParseUUIDPipe) jobId: string, @CurrentActor() actor: Actor) {
    return this.ai.matchResults(jobId, actor);
  }

  @Post('jd-draft')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ai:use', 'jobs:write')
  @Throttle(AI_LIMIT)
  @unavailable()
  @ApiZodBody(jdDraftInputSchema)
  @ApiZodOkResponse(jdDraftResponseSchema)
  jdDraft(@Body() body: JdDto) {
    return this.ai.jdDraft(body);
  }

  @Post('interview-kit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ai:use')
  @Throttle(AI_LIMIT)
  @unavailable()
  @ApiZodBody(interviewKitInputSchema)
  @ApiZodOkResponse(interviewKitSchema)
  interviewKit(@Body() body: KitDto, @CurrentActor() actor: Actor) {
    return this.ai.interviewKit(body.jobId, actor);
  }

  @Post('interview-summary/:applicationId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ai:use', 'applications:read')
  @Throttle(AI_LIMIT)
  @unavailable()
  @ApiZodOkResponse(interviewSummarySchema)
  interviewSummary(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.ai.interviewSummary(applicationId, actor);
  }

  @Get('requests')
  @RequirePermissions('ai:usage-read')
  @ApiZodOkResponse(z.object({ data: z.array(aiRequestSchema) }))
  requests(@Query() query: RequestsQueryDto) {
    return this.ai.requests(query);
  }

  @Get('usage')
  @RequirePermissions('ai:usage-read')
  @ApiZodOkResponse(aiUsageSchema)
  usage() {
    return this.ai.usage();
  }
}
