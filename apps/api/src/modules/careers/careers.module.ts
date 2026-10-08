import { Module } from '@nestjs/common';
import { CaptchaService } from './captcha.service';
import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';

@Module({
  controllers: [CareersController],
  providers: [CareersService, CaptchaService],
})
export class CareersModule {}
