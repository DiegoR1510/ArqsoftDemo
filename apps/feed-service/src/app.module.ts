import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({ controllers: [HealthController, FeedController], providers: [FeedService] })
export class AppModule {}
