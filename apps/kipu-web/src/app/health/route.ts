import type { HealthResponse } from '@kipu/contracts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const body: HealthResponse = { service: 'kipu-web', status: 'ok' };
  return Response.json(body);
}
