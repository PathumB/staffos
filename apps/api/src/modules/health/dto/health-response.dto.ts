import { ApiProperty } from '@nestjs/swagger';
import type { HealthResponse } from '@staffos/shared';

class HealthChecksDto {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  db: 'ok' | 'error';
}

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  status: 'ok' | 'error';

  @ApiProperty({ example: '0.1.0' })
  version: string;

  @ApiProperty({ example: 3600, description: 'Process uptime in seconds' })
  uptimeS: number;

  @ApiProperty({ type: HealthChecksDto })
  checks: HealthChecksDto;
}
