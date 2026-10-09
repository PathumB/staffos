import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { WeeklySummaryService } from './weekly-summary.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, WeeklySummaryService],
  exports: [ReportsService],
})
export class ReportsModule {}
