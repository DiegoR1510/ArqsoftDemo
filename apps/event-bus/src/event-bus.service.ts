import { Injectable, NotFoundException } from '@nestjs/common';
import { createEvent, type ConsumeRequest, type EventDelivery, type EventEnvelope, type PublishEventInput } from '@kipu/events';

interface GroupState { cursor: number; pending: EventDelivery | undefined; }
export interface DeadLetter { event: EventEnvelope; group: string; attempts: number; failed_at: string; }

@Injectable()
export class EventBusService {
  private readonly events: EventEnvelope[] = [];
  private readonly groups = new Map<string, GroupState>();
  private readonly deadLetters: DeadLetter[] = [];
  private readonly published = new Map<string, EventEnvelope>();
  private readonly confirmationTimeoutMs = 250;
  private readonly maxAttempts = 3;

  publish(input: PublishEventInput): EventEnvelope {
    const existing = input.idempotency_key ? this.published.get(input.idempotency_key) : undefined;
    if (existing) return existing;
    const event = createEvent(input);
    this.events.push(event);
    this.published.set(event.idempotency_key, event);
    return event;
  }

  consume(request: ConsumeRequest): EventDelivery | null {
    const key = this.groupKey(request);
    const state = this.groups.get(key) ?? { cursor: 0, pending: undefined };
    this.groups.set(key, state);
    if (state.pending) {
      if (Date.parse(state.pending.expires_at) > Date.now()) return state.pending;
      if (state.pending.attempt >= this.maxAttempts) {
        this.deadLetters.push({ event: state.pending.event, group: request.group, attempts: state.pending.attempt, failed_at: new Date().toISOString() });
        state.cursor += 1;
        state.pending = undefined;
      }
    }
    const event = this.events[state.cursor];
    if (!event) return null;
    const attempt = (state.pending?.attempt ?? 0) + 1;
    const delivery: EventDelivery = {
      delivery_id: `${event.event_id}:${request.group}:${request.consumer}:${attempt}`,
      event, attempt,
      expires_at: new Date(Date.now() + this.confirmationTimeoutMs).toISOString(),
    };
    state.pending = delivery;
    return delivery;
  }

  confirm(request: ConsumeRequest, deliveryId: string): void {
    const state = this.groups.get(this.groupKey(request));
    if (!state?.pending || state.pending.delivery_id !== deliveryId) throw new NotFoundException('Entrega no encontrada o ya confirmada');
    state.cursor += 1;
    state.pending = undefined;
  }

  getDeadLetters(): DeadLetter[] { return this.deadLetters.map((entry) => ({ ...entry })); }
  getEvents(): EventEnvelope[] { return this.events.map((event) => ({ ...event })); }
  private groupKey(request: ConsumeRequest): string { return request.group; }
}
