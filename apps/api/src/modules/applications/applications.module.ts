import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { HireService } from './hire.service';

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService, HireService],
})
export class ApplicationsModule {}
