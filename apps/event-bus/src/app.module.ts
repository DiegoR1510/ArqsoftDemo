import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { EventsController } from './events.controller';
import { EventBusService } from './event-bus.service';

@Module({ controllers: [HealthController, EventsController], providers: [EventBusService] })
export class AppModule {}
