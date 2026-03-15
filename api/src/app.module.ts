import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { AgentsModule } from './agents/agents.module';
import { BatchModule } from './batch/batch.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { VoiceNotesModule } from './voice-notes/voice-notes.module';
import { SettingsModule } from './settings/settings.module';
import { PostsModule } from './posts/posts.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    AgentsModule,
    BatchModule,
    PrismaModule,
    AuthModule,
    VoiceNotesModule,
    SettingsModule,
    PostsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
