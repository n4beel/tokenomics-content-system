import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'tokenomics-content-system',
    };
  }

  @Get('config')
  getConfig() {
    return {
      model: this.config.get<string>('LLM_MODEL', 'gemini-2.0-flash'),
      batchCron: this.config.get<string>('BATCH_CRON', '0 5 * * 6'),
      cmsUrl: this.config.get<string>('CMS_API_URL'),
      hasGeminiKey: !!this.config.get<string>('GOOGLE_GENAI_API_KEY'),
      hasOpenRouterKey: !!this.config.get<string>('OPENROUTER_API_KEY'),
      hasKimiKey: !!this.config.get<string>('KIMI_API_KEY'),
      hasCmsCredentials: !!(
        this.config.get<string>('CMS_EMAIL') &&
        this.config.get<string>('CMS_PASSWORD')
      ),
    };
  }
}
