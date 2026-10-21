import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@kipu/contracts';

@Controller('health')
export class HealthController {
  @Get()
  health(): HealthResponse {
    return { service: 'dependency-stubs', status: 'ok' };
  }
}
