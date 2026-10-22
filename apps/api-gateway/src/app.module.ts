import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { BusinessController } from './business.controller';
import { ApiManagementService } from './api-management.service';

@Module({ controllers: [HealthController, BusinessController], providers: [ApiManagementService] })
export class AppModule {}
