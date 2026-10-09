import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type IntegrationStatus,
  integrationStatusSchema,
  type SystemHealth,
  systemHealthSchema,
  zohoSyncResultSchema,
} from '@staffos/shared';
import { z } from 'zod';
import { RequirePermissions } from '../../common/auth/decorators';
import { ApiZodOkResponse } from '../../common/validation/zod';
import { AdminService } from './admin.service';
import { IntegrationsService } from './integrations.service';

@ApiTags('admin')
@Controller()
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly admin: AdminService,
  ) {}

  @Get('integrations')
  @RequirePermissions('integrations:manage')
  @ApiOperation({ summary: 'Status of mail, storage, AI, Zoho and CAPTCHA providers' })
  @ApiZodOkResponse(z.array(integrationStatusSchema))
  list(): IntegrationStatus[] {
    return this.integrations.status();
  }

  @Post('integrations/zoho/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('integrations:manage')
  @ApiOperation({ summary: 'Push clients and contacts to Zoho CRM (background job)' })
  @ApiZodOkResponse(zohoSyncResultSchema)
  sync(): Promise<{ jobId: string }> {
    return this.integrations.startZohoSync();
  }

  @Get('admin/system')
  @RequirePermissions('system:health-detail')
  @ApiOperation({ summary: 'DB, queue depth, AI provider and recent job failures' })
  @ApiZodOkResponse(systemHealthSchema)
  system(): Promise<SystemHealth> {
    return this.admin.system();
  }

  @Post('admin/demo-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('settings:manage')
  @ApiOperation({ summary: 'Re-apply the demo seed (only when DEMO_MODE=true)' })
  demoReset(): Promise<void> {
    return this.admin.demoReset();
  }
}
