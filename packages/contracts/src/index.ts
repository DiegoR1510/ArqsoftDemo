/** Contratos técnicos del paso 1; no contiene estado ni datos de negocio. */
export const SERVICE_DEFINITIONS = [
  { service: 'kipu-web', port: 3000 },
  { service: 'api-gateway', port: 4000 },
  { service: 'identity-service', port: 4001 },
  { service: 'media-service', port: 4002 },
  { service: 'feed-service', port: 4003 },
  { service: 'social-service', port: 4004 },
  { service: 'event-bus', port: 4010 },
  { service: 'ranking-service', port: 4011 },
  { service: 'notification-worker', port: 4012 },
  { service: 'transcode-worker', port: 4013 },
  { service: 'dependency-stubs', port: 4020 },
] as const;

export type ServiceId = (typeof SERVICE_DEFINITIONS)[number]['service'];
export interface HealthResponse {
  service: ServiceId;
  status: 'ok';
}
export interface ServiceStatus {
  service: ServiceId;
  port: number;
  status: 'ok' | 'unavailable';
}
export function getService(service: ServiceId): (typeof SERVICE_DEFINITIONS)[number] {
  const definition = SERVICE_DEFINITIONS.find((entry) => entry.service === service);
  if (!definition) throw new Error(`Servicio desconocido: ${service}`);
  return definition;
}
