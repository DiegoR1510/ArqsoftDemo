import { NotFoundException } from '@nestjs/common';

export function requireDemoMode(): void {
  if (process.env.DEMO_MODE !== 'true') throw new NotFoundException('Ruta de demo no disponible');
}
