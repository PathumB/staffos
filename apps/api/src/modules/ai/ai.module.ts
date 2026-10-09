import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AskDataService } from './ask-data.service';
import { CvDraftService } from './cv-draft.service';

@Module({
  controllers: [AiController],
  providers: [AiService, CvDraftService, AskDataService],
  exports: [CvDraftService],
})
export class AiModule {}
