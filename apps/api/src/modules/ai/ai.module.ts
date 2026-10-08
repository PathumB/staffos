import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CvDraftService } from './cv-draft.service';

@Module({
  controllers: [AiController],
  providers: [AiService, CvDraftService],
  exports: [CvDraftService],
})
export class AiModule {}
