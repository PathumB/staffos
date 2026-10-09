import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ClientRevenue,
  clientRevenueSchema,
  type Dashboard,
  dashboardSchema,
  exportQuerySchema,
  type HiringFunnel,
  hiringFunnelSchema,
  type OpenRequests,
  openRequestsSchema,
  reportFilterSchema,
  type TimeToHire,
  timeToHireSchema,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { AuditService } from '../audit/audit.service';
import { EXPORT_TYPES, toCsv, toPdf, toXlsx } from './report-export';
import { ReportsService } from './reports.service';

class FilterDto extends createZodDto(reportFilterSchema) {}
class ExportDto extends createZodDto(exportQuerySchema) {}

/** All numbers come from the reporting views and respect the caller's data scope (US-DASH-01). */
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Widgets for each of my roles' })
  @ApiZodOkResponse(dashboardSchema)
  dashboard(@CurrentActor() actor: Actor): Promise<Dashboard> {
    return this.reports.dashboard(actor);
  }

  @Get('hiring-funnel')
  @RequirePermissions('reports:read')
  @ApiZodOkResponse(hiringFunnelSchema)
  funnel(@Query() q: FilterDto, @CurrentActor() actor: Actor): Promise<HiringFunnel> {
    return this.reports.hiringFunnel(q, actor);
  }

  @Get('time-to-hire')
  @RequirePermissions('reports:read')
  @ApiZodOkResponse(timeToHireSchema)
  timeToHire(@Query() q: FilterDto, @CurrentActor() actor: Actor): Promise<TimeToHire> {
    return this.reports.timeToHire(q, actor);
  }

  @Get('client-revenue')
  @RequirePermissions('reports:read')
  @ApiZodOkResponse(clientRevenueSchema)
  revenue(@Query() q: FilterDto, @CurrentActor() actor: Actor): Promise<ClientRevenue> {
    return this.reports.clientRevenue(q, actor);
  }

  @Get('open-requests')
  @RequirePermissions('reports:read')
  @ApiZodOkResponse(openRequestsSchema)
  openRequests(@Query() q: FilterDto, @CurrentActor() actor: Actor): Promise<OpenRequests> {
    return this.reports.openRequests(q, actor);
  }

  @Get(':name/export')
  @RequirePermissions('reports:export')
  @ApiOperation({ summary: 'CSV, Excel or PDF with the same filters as the screen' })
  async export(
    @Param('name') name: string,
    @Query() q: ExportDto,
    @CurrentActor() actor: Actor,
  ): Promise<StreamableFile> {
    const { format, ...filter } = q;
    const table = await this.reports.table(name, filter, actor);
    const range = [filter.from, filter.to].filter(Boolean).join(' to ') || 'All dates';
    const body =
      format === 'csv'
        ? Buffer.from(toCsv(table), 'utf8')
        : format === 'xlsx'
          ? await toXlsx(table)
          : await toPdf(table, range);
    await this.audit.record({
      action: 'EXPORT',
      entity: 'report',
      after: { name, format, ...filter },
    });
    return new StreamableFile(body, {
      type: EXPORT_TYPES[format],
      disposition: `attachment; filename="staffos-${name}.${format}"`,
    });
  }
}
