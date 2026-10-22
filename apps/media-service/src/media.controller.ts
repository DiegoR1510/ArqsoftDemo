import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import type { UploadBody } from './media.service';
import { MediaService } from './media.service';

interface HttpResponse { status(code: number): HttpResponse; header(name: string, value: string): HttpResponse; send(body: Buffer): void; }

@Controller('v1')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Post('uploads') upload(@Headers('authorization') authorization: string | undefined, @Body() body: UploadBody) { return this.media.createUpload(authorization, body); }
  @Post('internal/demo/seed') seedDemo() { return this.media.seedDemo(); }
  @Post('uploads/:id/complete') complete(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.media.completeUpload(authorization, id); }
  @Get('videos/:id') video(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.media.getVideo(authorization, id); }
  @Get('videos/:id/playback') playback(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.media.getPlayback(authorization, id); }
  @Get('videos/:id/playback/file') async file(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Query('token') token: string | undefined, @Res() response: HttpResponse) { const content = await this.media.readPlayback(authorization, id, token); response.status(200).header('content-type', 'video/mp4').send(content); }
  @Delete('videos/:id') remove(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.media.deleteVideo(authorization, id); }
}
