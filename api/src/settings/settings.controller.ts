import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { SettingsService, SystemConfigData } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getConfig() {
    return this.settings.getConfig();
  }

  @Patch()
  updateConfig(@Body() body: Partial<SystemConfigData>) {
    return this.settings.updateConfig(body);
  }
}
