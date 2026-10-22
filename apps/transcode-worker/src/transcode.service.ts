import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBusClient, type EventDelivery } from '@kipu/events';

interface UploadedVideo { id: string; title: string; owner_id: string; content_type: string; size_bytes: number; }

@Injectable()
export class TranscodeService implements OnModuleInit, OnModuleDestroy {
  private readonly events = new EventBusClient(process.env.KIPU_EVENT_BUS_URL ?? 'http://127.0.0.1:4010');
  private polling = true;

  onModuleInit(): void { void this.consume(); }
  onModuleDestroy(): void { this.polling = false; }

  private async consume(): Promise<void> {
    while (this.polling) {
      try {
        const delivery = await this.events.consume<UploadedVideo>({ group: 'transcode-worker', consumer: 'transcode-worker-1' });
        if (delivery) await this.process(delivery);
      } catch { /* Un fallo deja la entrega pendiente para que el bus la reentregue. */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async process(delivery: EventDelivery<UploadedVideo>): Promise<void> {
    const video = delivery.event.payload;
    if (delivery.event.type !== 'video.uploaded') {
      await this.events.confirm({ group: 'transcode-worker', consumer: 'transcode-worker-1', delivery_id: delivery.delivery_id });
      return;
    }
    if (video.title.toLowerCase().includes('[fallo-transcode]')) throw new Error('Fallo de transcodificacion simulado');
    if (!video.id || video.content_type !== 'video/mp4') {
      await this.events.publish({ type: 'video.failed', payload: { video_id: video.id, reason: 'payload_invalido' }, idempotency_key: `video.failed:${video.id}` });
    } else {
      await this.events.publish({ type: 'video.transcoded', payload: { video_id: video.id, title: video.title, owner_id: video.owner_id }, idempotency_key: `video.transcoded:${video.id}` });
    }
    await this.events.confirm({ group: 'transcode-worker', consumer: 'transcode-worker-1', delivery_id: delivery.delivery_id });
  }
}
