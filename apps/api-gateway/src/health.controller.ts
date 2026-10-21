import { Controller, Get } from '@nestjs/common';
import { SERVICE_DEFINITIONS } from '@kipu/contracts';
import type { HealthResponse, ServiceStatus } from '@kipu/contracts';

@Controller('health')
export class HealthController {
  @Get()
  health(): HealthResponse {
    return { service: 'api-gateway', status: 'ok' };
  }

  /** Diagnóstico local de procesos; no es una ruta de negocio. */
  @Get('services')
  async services(): Promise<ServiceStatus[]> {
    return Promise.all(SERVICE_DEFINITIONS.map(async (definition): Promise<ServiceStatus> => {
      try {
        const response = await fetch(`http://127.0.0.1:${definition.port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        const body = await response.json() as Partial<HealthResponse>;
        if (!response.ok || body.service !== definition.service || body.status !== 'ok') {
          throw new Error('Respuesta de salud inesperada');
        }
        return { ...definition, status: 'ok' };
      } catch {
        return { ...definition, status: 'unavailable' };
      }
    }));
  }
}
