import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({ controllers: [HealthController, SocialController], providers: [SocialService] })
export class AppModule {}
