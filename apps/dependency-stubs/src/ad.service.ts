import { Injectable } from '@nestjs/common';

@Injectable()
export class AdService {
  private latencyMs = 5;
  private sequence = 0;
  async getAd(position: number): Promise<{ kind: 'ad'; id: string; title: string; position: number }> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    this.sequence += 1;
    return { kind: 'ad', id: `ad-${this.sequence}`, title: `Anuncio demo ${position}`, position };
  }
  setLatency(latencyMs: number): { latency_ms: number } { this.latencyMs = Math.max(0, latencyMs); return { latency_ms: this.latencyMs }; }
  getLatency(): { latency_ms: number } { return { latency_ms: this.latencyMs }; }
}
