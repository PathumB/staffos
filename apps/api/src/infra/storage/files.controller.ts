import { Controller, Get, HttpStatus, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { StorageService } from './storage.service';

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Download route for the local storage provider's signed URLs. Public because the URL itself is
 * the credential (HMAC-signed, 5-minute expiry), exactly like a cloud signed URL.
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async download(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const file = token.length < 2_000 ? await this.storage.local?.read(token) : null;
    if (!file) throw new NotFoundException();
    const ext = file.key.split('.').pop() ?? '';
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
    // Always a download, never rendered inline from our origin.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.name.replace(/[^\w.-]/g, '_')}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(file.data);
  }
}
