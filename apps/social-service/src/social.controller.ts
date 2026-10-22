import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { SocialService } from './social.service';

@Controller('v1/social')
export class SocialController {
  constructor(private readonly social: SocialService) {}
  @Post('follow/:id') follow(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.social.follow(authorization, id); }
  @Delete('follow/:id') unfollow(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.social.unfollow(authorization, id); }
  @Post('videos/:id/like') like(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.social.like(authorization, id); }
  @Post('videos/:id/comments') comment(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: { text?: string; parent_id?: string }) { return this.social.comment(authorization, id, body); }
  @Get('videos/:id/comments') comments(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.social.listComments(authorization, id); }
  @Post('block/:id') block(@Headers('authorization') authorization: string | undefined, @Param('id') id: string) { return this.social.block(authorization, id); }
  @Post('counters/batch') counters(@Headers('authorization') authorization: string | undefined, @Body() body: { video_ids?: string[] }) { return this.social.counters(authorization, body); }
}
