import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({ controllers: [HealthController, NotificationController], providers: [NotificationService] })
export class AppModule {}
