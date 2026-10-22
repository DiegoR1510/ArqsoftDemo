import { Body, Controller, Get, Post } from '@nestjs/common';
import { RankingService, type RankingCandidate } from './ranking.service';

@Controller('internal/ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}
  @Post('rank') rank(@Body() body: { candidates?: RankingCandidate[] }) { return this.ranking.rank(body); }
  @Post('ruleset') ruleset(@Body() body: { version?: string }) { return this.ranking.setRuleset(body.version ?? 'rk-2026.10.json'); }
  @Get('ruleset') active() { return this.ranking.getRuleset(); }
  @Post('mode') mode(@Body() body: { failing?: boolean; latency_ms?: number }) { return this.ranking.setMode(body); }
}
