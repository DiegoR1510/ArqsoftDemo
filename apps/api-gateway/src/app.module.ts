import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { BusinessController } from './business.controller';

@Module({ controllers: [HealthController, BusinessController] })
export class AppModule {}
