import { Module } from '@nestjs/common';
import { ManpowerRequestsController } from './manpower-requests.controller';
import { ManpowerRequestsService } from './manpower-requests.service';

@Module({
  controllers: [ManpowerRequestsController],
  providers: [ManpowerRequestsService],
})
export class ManpowerRequestsModule {}
