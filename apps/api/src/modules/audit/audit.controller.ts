import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditLogListQuerySchema,
  auditLogSchema,
  type AuditLog,
  type Paginated,
} from '@staffos/shared';
import { z } from 'zod';
import { RequirePermissions } from '../../common/auth/decorators';
import { ApiListQuery, ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { AuditService } from './audit.service';

class AuditLogListQueryDto extends createZodDto(auditLogListQuerySchema) {}

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Search the audit log (read-only)' })
  @ApiListQuery(['actorId', 'entity', 'entityId', 'action', 'from', 'to'])
  @ApiZodOkResponse(z.object({ data: z.array(auditLogSchema) }))
  list(@Query() query: AuditLogListQueryDto): Promise<Paginated<AuditLog>> {
    return this.audit.list(query);
  }
}
