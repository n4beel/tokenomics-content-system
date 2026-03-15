import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  // Enable CORS for dashboard (Next.js will run on a different port)
  app.enableCors({
    origin: ['http://localhost:3001', 'http://localhost:3002'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Global API prefix
  app.setGlobalPrefix('api');

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Content System API running on http://localhost:${port}/api`);
  logger.log(`LLM Model: ${process.env.LLM_MODEL || 'gemini-2.0-flash'}`);
  logger.log(`Batch schedule: ${process.env.BATCH_CRON || '0 5 * * 6'}`);
}
bootstrap();
