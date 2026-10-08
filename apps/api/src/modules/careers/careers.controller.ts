import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  applyResponseSchema,
  applySchema,
  type ApplyResponse,
  dataRequestSchema,
  MAX_UPLOAD_BYTES,
  type Paginated,
  type PublicJob,
  publicJobQuerySchema,
  publicJobSchema,
  type Tracking,
  trackingSchema,
} from '@staffos/shared';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator';
import { ApiZodBody, ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import type { UploadedFile as File } from '../documents/document.rules';
import { CareersService } from './careers.service';

class JobQueryDto extends createZodDto(publicJobQuerySchema) {}
class ApplyDto extends createZodDto(applySchema) {}
class DataRequestDto extends createZodDto(dataRequestSchema) {}

const HOUR = 3_600_000;
/** security.md §2: 5 applications per hour per IP; raised only for the E2E suite. */
const applyLimit = () => Number(process.env.CAREERS_APPLY_RATE_LIMIT_PER_HOUR) || 5;

/** Public careers portal: no session, public fields only (US-CAREERS-01..03). */
@ApiTags('careers')
@Controller('careers')
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  @Public()
  @Get('jobs')
  @ApiOperation({ summary: 'Open jobs (search, emirate, category)' })
  @ApiZodOkResponse(z.object({ data: z.array(publicJobSchema) }))
  listJobs(@Query() query: JobQueryDto): Promise<Paginated<PublicJob>> {
    return this.careers.listJobs(query);
  }

  @Public()
  @Get('jobs/:slug')
  @ApiZodOkResponse(publicJobSchema)
  getJob(@Param('slug') slug: string): Promise<PublicJob> {
    return this.careers.getJob(slug);
  }

  @Public()
  @Post('jobs/:slug/apply')
  @Throttle({ default: { limit: applyLimit, ttl: HOUR } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Apply with details and a CV (pdf/docx); emails a tracking link' })
  @ApiConflictResponse({ description: 'ALREADY_APPLIED' })
  @ApiTooManyRequestsResponse({ description: 'More than 5 applications per hour from one IP' })
  @ApiZodOkResponse(applyResponseSchema)
  apply(
    @Param('slug') slug: string,
    @Body() body: ApplyDto,
    @UploadedFile() file: File | undefined,
    @Ip() ip: string,
  ): Promise<ApplyResponse> {
    return this.careers.apply(slug, body, file, ip);
  }

  @Public()
  @Get('applications/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Candidate-friendly status for a tracking link' })
  @ApiZodOkResponse(trackingSchema)
  track(@Param('token') token: string): Promise<Tracking> {
    return this.careers.track(token);
  }

  @Public()
  @Post('applications/:token/data-request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Ask for a copy or deletion of my data (creates an HR task)' })
  @ApiZodBody(dataRequestSchema)
  @ApiAcceptedResponse()
  dataRequest(@Param('token') token: string, @Body() body: DataRequestDto): Promise<void> {
    return this.careers.dataRequest(token, body);
  }
}
