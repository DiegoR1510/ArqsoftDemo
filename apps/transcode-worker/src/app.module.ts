import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TranscodeService } from './transcode.service';

@Module({ controllers: [HealthController], providers: [TranscodeService] })
export class AppModule {}
