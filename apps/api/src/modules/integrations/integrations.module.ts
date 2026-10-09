import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, AdminService],
})
export class IntegrationsModule {}
