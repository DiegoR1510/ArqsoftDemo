import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AdController } from './ad.controller';
import { AdService } from './ad.service';

@Module({ controllers: [HealthController, AdController], providers: [AdService] })
export class AppModule {}
