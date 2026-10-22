import { Controller, Get, Headers } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('v1/notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}
  @Get() list(@Headers('authorization') authorization: string | undefined) { return this.notifications.list(authorization); }
}
