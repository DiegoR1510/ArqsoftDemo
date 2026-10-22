import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';

@Module({ controllers: [HealthController, RankingController], providers: [RankingService] })
export class AppModule {}
