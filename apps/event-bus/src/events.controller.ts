import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { ConsumeRequest, ConfirmRequest, PublishEventInput } from '@kipu/events';
import { EventBusService } from './event-bus.service';

interface HttpResponse { status(code: number): HttpResponse; send(): void; json(body: unknown): void; }

@Controller()
export class EventsController {
  constructor(private readonly bus: EventBusService) {}
  @Post('v1/events') publish(@Body() input: PublishEventInput) { return this.bus.publish(input); }
  @Get('v1/consumers/:group/:consumer/next')
  @HttpCode(200)
  consume(@Param() params: ConsumeRequest, @Res() response: HttpResponse) {
    const delivery = this.bus.consume(params);
    if (!delivery) return response.status(204).send();
    return response.json(delivery);
  }
  @Post('v1/consumers/:group/:consumer/confirm')
  confirm(@Param() params: ConsumeRequest, @Body() body: ConfirmRequest) {
    this.bus.confirm(params, body.delivery_id);
    return { confirmed: true };
  }
  @Get('debug/dead-letters') deadLetters() { return this.bus.getDeadLetters(); }
  @Get('debug/events') events() { return this.bus.getEvents().slice(-30); }
}
