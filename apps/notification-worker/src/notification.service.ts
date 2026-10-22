import { Injectable, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { bearerToken, verifyAccessToken } from '@kipu/auth';
import { EventBusClient, EventDeduplicator } from '@kipu/events';

export interface NotificationRecord { id: string; type: 'follow' | 'like' | 'comment'; recipient_id: string; actor_id: string; video_id?: string; text: string; created_at: string; }

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly notifications: NotificationRecord[] = [];
  private readonly events = new EventBusClient(process.env.KIPU_EVENT_BUS_URL ?? 'http://127.0.0.1:4010');
  private readonly dedupe = new EventDeduplicator();
  private readonly jwtSecret = process.env.KIPU_JWT_SECRET ?? 'kipu-local-development-secret-change-me';
  private polling = true;
  onModuleInit(): void { void this.consume(); }
  onModuleDestroy(): void { this.polling = false; }

  list(authorization: string | undefined): NotificationRecord[] { return this.notifications.filter((notification) => notification.recipient_id === this.userId(authorization)); }

  private async consume(): Promise<void> {
    while (this.polling) {
      try {
        const delivery = await this.events.consume<{ actor_id?: string; recipient_id?: string; video_id?: string; comment_id?: string; text?: string }>({ group: 'notification-worker', consumer: 'notification-worker-1' });
        if (delivery) {
          this.dedupe.process(delivery.event, () => this.create(delivery.event.type, delivery.event.payload));
          await this.events.confirm({ group: 'notification-worker', consumer: 'notification-worker-1', delivery_id: delivery.delivery_id });
        }
      } catch { /* La entrega queda pendiente para reentrega. */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private create(type: string, payload: { actor_id?: string; recipient_id?: string; video_id?: string; text?: string }): void {
    if (!payload.actor_id || !payload.recipient_id || payload.actor_id === payload.recipient_id) return;
    const kind = type === 'social.followed' ? 'follow' : type === 'social.liked' ? 'like' : type === 'social.commented' ? 'comment' : null;
    if (!kind) return;
    this.notifications.push({ id: `${type}:${payload.actor_id}:${payload.video_id ?? payload.recipient_id}:${this.notifications.length}`, type: kind, recipient_id: payload.recipient_id, actor_id: payload.actor_id, ...(payload.video_id ? { video_id: payload.video_id } : {}), text: kind === 'follow' ? 'te sigue' : kind === 'like' ? 'indico que le gusta tu video' : 'comento tu video', created_at: new Date().toISOString() });
  }

  private userId(authorization: string | undefined): string {
    const token = bearerToken(authorization);
    if (!token) throw new UnauthorizedException('Bearer token requerido');
    try { return verifyAccessToken(token, this.jwtSecret).sub; } catch { throw new UnauthorizedException('Bearer token invalido'); }
  }
}
