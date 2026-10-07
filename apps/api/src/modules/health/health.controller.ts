import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and database connectivity (used by the uptime monitor)' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: HealthResponseDto, description: 'A dependency is down' })
  async get(@Res({ passthrough: true }) res: Response): Promise<HealthResponseDto> {
    const result = await this.health.check();
    if (result.status !== 'ok') {
      res.status(503);
    }
    return result;
  }
}
