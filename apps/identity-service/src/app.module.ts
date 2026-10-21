import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthController } from './auth.controller';
import { UsersController } from './users.controller';
import { IdentityService } from './identity.service';

@Module({ controllers: [HealthController, AuthController, UsersController], providers: [IdentityService] })
export class AppModule {}
