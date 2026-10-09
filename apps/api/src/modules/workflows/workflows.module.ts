import { Global, Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

/** Global: manpower requests, offers and automations run approval chains through it. */
@Global()
@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsService, ApprovalsService],
  exports: [ApprovalsService],
})
export class WorkflowsModule {}
