import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

@Injectable()
export class VoiceNotesService {
  private readonly logger = new Logger(VoiceNotesService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly genai: GoogleGenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('R2_BUCKET', 'tokenomics-voice-notes');
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL', '');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: this.config.get<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID', ''),
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY', ''),
      },
      // R2 doesn't support AWS SDK v3's default checksum headers
      requestChecksumCalculation: 'WHEN_REQUIRED' as any,
      responseChecksumValidation: 'WHEN_REQUIRED' as any,
    });

    this.genai = new GoogleGenAI({
      apiKey: this.config.get<string>('GOOGLE_GENAI_API_KEY', ''),
    });
  }

  async upload(
    file: Express.Multer.File,
    tags: string[],
  ) {
    const ext = this.mimeToExt(file.mimetype);
    const key = `voice-notes/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    // 1. Upload to R2
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (err) {
      this.logger.error('R2 upload failed', err);
      throw new InternalServerErrorException('Failed to upload audio');
    }

    const r2Url = `${this.publicUrl}/${key}`;

    // 2. Transcribe via Gemini
    let transcript: string | null = null;
    try {
      transcript = await this.transcribe(file.buffer, file.mimetype);
    } catch (err) {
      this.logger.warn('Transcription failed, saving without transcript', err);
    }

    // 3. Save to DB
    const note = await this.prisma.voiceNote.create({
      data: {
        filename: file.originalname,
        mimeType: file.mimetype,
        r2Key: key,
        r2Url,
        tags,
        transcript,
      },
    });

    return note;
  }

  async list(search?: string) {
    return this.prisma.voiceNote.findMany({
      where: search
        ? { transcript: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPresignedUrl(id: string) {
    const note = await this.prisma.voiceNote.findUniqueOrThrow({ where: { id } });
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: note.r2Key }),
      { expiresIn: 3600 },
    );
    return { url };
  }

  async delete(id: string) {
    const note = await this.prisma.voiceNote.findUniqueOrThrow({ where: { id } });
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: note.r2Key }),
    );
    await this.prisma.voiceNote.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  private async transcribe(buffer: Buffer, mimeType: string): Promise<string> {
    const model = this.config.get<string>('LLM_MODEL', 'gemini-2.0-flash');
    const result = await this.genai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: buffer.toString('base64'),
              },
            },
            {
              text: 'Please transcribe this audio recording accurately. Return only the transcript text, no additional commentary.',
            },
          ],
        },
      ],
    });
    return result.text ?? '';
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'audio/webm': '.webm',
      'audio/wav': '.wav',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/ogg': '.ogg',
      'audio/flac': '.flac',
    };
    return map[mime] ?? '.audio';
  }
}
