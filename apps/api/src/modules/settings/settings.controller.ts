import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Settings, settingsSchema, settingsUpdateSchema } from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import { ApiZodOkResponse, createZodDto } from '../../common/validation/zod';
import { SettingsService } from './settings.service';

class SettingsUpdateDto extends createZodDto(settingsUpdateSchema) {}

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions('settings:manage')
  @ApiZodOkResponse(settingsSchema)
  get(): Promise<Settings> {
    return this.settings.getAll();
  }

  @Patch()
  @RequirePermissions('settings:manage')
  @ApiOperation({ summary: 'Change one or more settings (audited); effective immediately' })
  @ApiZodOkResponse(settingsSchema)
  update(@Body() body: SettingsUpdateDto, @CurrentActor() actor: Actor): Promise<Settings> {
    return this.settings.update(body, actor.id);
  }
}
