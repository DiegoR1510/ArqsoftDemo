import { randomUUID } from 'node:crypto';

export interface EventEnvelope<TPayload = unknown> {
  event_id: string;
  type: string;
  payload: TPayload;
  idempotency_key: string;
  trace_id: string;
  occurred_at: string;
}
export interface EventDelivery<TPayload = unknown> {
  delivery_id: string;
  event: EventEnvelope<TPayload>;
  attempt: number;
  expires_at: string;
}
export interface PublishEventInput<TPayload = unknown> {
  type: string;
  payload: TPayload;
  idempotency_key?: string;
  trace_id?: string;
}
export interface ConsumeRequest { group: string; consumer: string; }
export interface ConfirmRequest { delivery_id: string; }

export function createEvent<TPayload>(input: PublishEventInput<TPayload>): EventEnvelope<TPayload> {
  return {
    event_id: randomUUID(), type: input.type, payload: input.payload,
    idempotency_key: input.idempotency_key ?? randomUUID(),
    trace_id: input.trace_id ?? randomUUID(), occurred_at: new Date().toISOString(),
  };
}

export class EventDeduplicator {
  private readonly seen = new Set<string>();
  hasProcessed(key: string): boolean { return this.seen.has(key); }
  markProcessed(key: string): void { this.seen.add(key); }
  process<T>(event: Pick<EventEnvelope<T>, 'idempotency_key'>, effect: () => void): boolean {
    if (this.hasProcessed(event.idempotency_key)) return false;
    effect(); this.markProcessed(event.idempotency_key); return true;
  }
}

export class EventBusClient {
  constructor(private readonly baseUrl: string) {}
  async publish<T>(input: PublishEventInput<T>): Promise<EventEnvelope<T>> {
    return this.request('/v1/events', input);
  }
  async consume<T>(request: ConsumeRequest): Promise<EventDelivery<T> | null> {
    const response = await fetch(`${this.baseUrl}/v1/consumers/${encodeURIComponent(request.group)}/${encodeURIComponent(request.consumer)}/next`);
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Consume failed: ${response.status}`);
    return response.json() as Promise<EventDelivery<T>>;
  }
  async confirm(request: ConsumeRequest & ConfirmRequest): Promise<{ confirmed: true }> {
    return this.request(`/v1/consumers/${encodeURIComponent(request.group)}/${encodeURIComponent(request.consumer)}/confirm`, { delivery_id: request.delivery_id });
  }
  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Event bus request failed: ${response.status}`);
    return response.json() as Promise<T>;
  }
}
