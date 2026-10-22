import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AdService } from './ad.service';

@Controller('internal/ad-server')
export class AdController {
  constructor(private readonly ads: AdService) {}
  @Get('slot') slot(@Query('position') position?: string) { return this.ads.getAd(Number(position ?? 0)); }
  @Post('latency') latency(@Body() body: { latency_ms?: number }) { return this.ads.setLatency(body.latency_ms ?? 0); }
  @Get('latency') currentLatency() { return this.ads.getLatency(); }
}
