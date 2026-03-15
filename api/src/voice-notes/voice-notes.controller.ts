import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { VoiceNotesService } from './voice-notes.service';

@Controller('voice-notes')
@UseGuards(JwtAuthGuard)
export class VoiceNotesController {
  constructor(private readonly service: VoiceNotesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }), // 100MB
          new FileTypeValidator({ fileType: /audio\/.+/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('tags') tagsRaw?: string,
  ) {
    const tags: string[] = tagsRaw
      ? JSON.parse(tagsRaw).filter((t: string) => t.trim())
      : [];
    return this.service.upload(file, tags);
  }

  @Get()
  list(@Query('search') search?: string) {
    return this.service.list(search);
  }

  @Get(':id/audio')
  getAudio(@Param('id') id: string) {
    return this.service.getPresignedUrl(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
