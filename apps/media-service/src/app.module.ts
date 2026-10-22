import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController, MediaController], providers: [MediaService] })
export class AppModule {}
