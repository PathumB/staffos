import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AutomationActionsService } from './automation-actions.service';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

@Module({
  imports: [WebhooksModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationActionsService],
})
export class AutomationsModule {}
