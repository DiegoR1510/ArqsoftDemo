import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { FeedService } from './feed.service';

@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}
  @Get('v1/feed') feedPage(@Headers('authorization') authorization: string | undefined, @Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.feed.getFeed(authorization, cursor, limit); }
  @Get('v1/search') search(@Query('q') query?: string, @Query('hashtag') hashtag?: string) { return this.feed.search(query, hashtag); }
  @Post('v1/feed/viewed') viewed(@Headers('authorization') authorization: string | undefined, @Body() body: { video_id?: string }) { return this.feed.markViewed(authorization, body.video_id ?? ''); }
  @Get('internal/metrics') metrics() { return this.feed.metrics(); }
}
