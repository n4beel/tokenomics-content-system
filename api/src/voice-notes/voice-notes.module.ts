import { Module } from '@nestjs/common';
import { VoiceNotesService } from './voice-notes.service';
import { VoiceNotesController } from './voice-notes.controller';

@Module({
  providers: [VoiceNotesService],
  controllers: [VoiceNotesController],
})
export class VoiceNotesModule {}
