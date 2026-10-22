import { Injectable, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { bearerToken, verifyAccessToken } from '@kipu/auth';
import { EventBusClient, EventDeduplicator } from '@kipu/events';

interface PublishedVideo { video_id: string; owner_id: string; title: string; hashtags: string[]; created_at: string; }
export interface VideoCard { kind: 'video'; id: string; title: string; creator_id: string; hashtags: string[]; status: 'PUBLISHED'; created_at: string; }
interface RankingResponse { ids: string[]; ruleset_version: string; }

@Injectable()
export class FeedService implements OnModuleInit, OnModuleDestroy {
  private readonly videos = new Map<string, VideoCard>();
  private readonly viewed = new Map<string, Set<string>>();
  private readonly following = new Map<string, Set<string>>();
  private readonly engagement = new Map<string, number>();
  private readonly events = new EventBusClient(process.env.KIPU_EVENT_BUS_URL ?? 'http://127.0.0.1:4010');
  private readonly socialDedupe = new EventDeduplicator();
  private readonly jwtSecret = process.env.KIPU_JWT_SECRET ?? 'kipu-local-development-secret-change-me';
  private readonly rankingUrl = 'http://127.0.0.1:4011';
  private readonly adUrl = 'http://127.0.0.1:4020';
  private polling = true;
  private rankingFailures = 0;
  private rankingCircuitUntil = 0;
  private adFallbacks = 0;

  onModuleInit(): void { void this.consumeEvents(); }
  onModuleDestroy(): void { this.polling = false; }

  async getFeed(authorization: string | undefined, cursor = '0', limit = '10'): Promise<{ items: Array<VideoCard | { kind: 'ad'; id: string; title: string; position: number }>; next_cursor: string | null; ruleset_version: string; degraded: boolean }> {
    const userId = this.userId(authorization);
    const pageSize = Math.min(20, Math.max(1, Number(limit) || 10));
    const start = Math.max(0, Number(cursor) || 0);
    const candidates = [...this.videos.values()].filter((video) => !this.viewed.get(userId)?.has(video.id));
    const ranked = await this.rank(candidates);
    const byId = new Map(candidates.map((video) => [video.id, video]));
    const ordered = ranked.ids.map((id) => byId.get(id)).filter((video): video is VideoCard => video !== undefined);
    const items: Array<VideoCard | { kind: 'ad'; id: string; title: string; position: number }> = [];
    let organicIndex = 0;
    let position = start;
    while (items.length < pageSize && position < start + pageSize) {
      const slot = position + 1;
      const ad = [4, 12, 20].includes(slot) ? await this.fetchAd(slot) : null;
      if (ad) items.push(ad);
      else {
        const organic = ordered[organicIndex];
        if (!organic) break;
        items.push(organic); organicIndex += 1;
      }
      position += 1;
    }
    const next = items.length === pageSize ? String(start + pageSize) : null;
    return { items, next_cursor: next, ruleset_version: ranked.ruleset_version, degraded: ranked.degraded };
  }

  search(query: string | undefined, hashtag: string | undefined): { items: VideoCard[]; ruleset_version: string; degraded: false } {
    const normalizedQuery = (query ?? '').toLowerCase();
    const normalizedHashtag = (hashtag ?? '').replace(/^#/, '').toLowerCase();
    const items = [...this.videos.values()].filter((video) => (!normalizedQuery || video.title.toLowerCase().includes(normalizedQuery)) && (!normalizedHashtag || video.hashtags.some((tag) => tag.toLowerCase() === normalizedHashtag)));
    return { items, ruleset_version: 'search-basic', degraded: false };
  }

  followingFeed(authorization: string | undefined): { items: VideoCard[]; ruleset_version: 'following-basic'; degraded: false } {
    const userId = this.userId(authorization);
    const followed = this.following.get(userId) ?? new Set<string>();
    return { items: [...this.videos.values()].filter((video) => followed.has(video.creator_id)).sort((left, right) => right.created_at.localeCompare(left.created_at)), ruleset_version: 'following-basic', degraded: false };
  }

  markViewed(authorization: string | undefined, videoId: string): { viewed: true; video_id: string } {
    const userId = this.userId(authorization);
    const set = this.viewed.get(userId) ?? new Set<string>();
    set.add(videoId); this.viewed.set(userId, set);
    return { viewed: true, video_id: videoId };
  }

  metrics(): { ad_fallbacks: number; published_videos: number; ranking_circuit_open: boolean } { return { ad_fallbacks: this.adFallbacks, published_videos: this.videos.size, ranking_circuit_open: Date.now() < this.rankingCircuitUntil }; }

  private async consumeEvents(): Promise<void> {
    while (this.polling) {
      try {
        const delivery = await this.events.consume<PublishedVideo | { video_id: string }>({ group: 'feed-service', consumer: 'feed-service-1' });
        if (delivery) {
          if (delivery.event.type === 'video.published') {
            const event = delivery.event.payload as PublishedVideo;
            this.videos.set(event.video_id, { kind: 'video', id: event.video_id, title: event.title, creator_id: event.owner_id, hashtags: event.hashtags ?? [], status: 'PUBLISHED', created_at: event.created_at });
          }
          if (delivery.event.type === 'video.deleted') this.videos.delete((delivery.event.payload as { video_id: string }).video_id);
          if (delivery.event.type === 'social.liked' || delivery.event.type === 'social.followed' || delivery.event.type === 'social.unfollowed') this.socialDedupe.process(delivery.event, () => this.applySocial(delivery.event.type, delivery.event.payload as { actor_id?: string; follower_id?: string; following_id?: string; video_id?: string }));
          await this.events.confirm({ group: 'feed-service', consumer: 'feed-service-1', delivery_id: delivery.delivery_id });
        }
      } catch { /* Una entrega no confirmada se reintentara. */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async rank(candidates: VideoCard[]): Promise<RankingResponse & { degraded: boolean }> {
    const fallback = (): RankingResponse & { degraded: boolean } => ({ ids: [...candidates].sort((left, right) => right.created_at.localeCompare(left.created_at)).map((video) => video.id), ruleset_version: 'fallback-recent-popular', degraded: true });
    if (Date.now() < this.rankingCircuitUntil) return fallback();
    try {
      const response = await fetch(`${this.rankingUrl}/internal/ranking/rank`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ candidates: candidates.map((video) => ({ id: video.id, popularity: this.popularity(video.id, video.hashtags) + (this.engagement.get(video.id) ?? 0) * 20, created_at: video.created_at, hashtags: video.hashtags })) }), signal: AbortSignal.timeout(100) });
      if (!response.ok) throw new Error(`ranking ${response.status}`);
      const result = await response.json() as RankingResponse;
      this.rankingFailures = 0;
      return { ...result, degraded: false };
    } catch {
      this.rankingFailures += 1;
      if (this.rankingFailures >= 2) this.rankingCircuitUntil = Date.now() + 1000;
      return fallback();
    }
  }

  private async fetchAd(position: number): Promise<{ kind: 'ad'; id: string; title: string; position: number } | null> {
    try {
      const response = await fetch(`${this.adUrl}/internal/ad-server/slot?position=${position}`, { signal: AbortSignal.timeout(80) });
      if (!response.ok) throw new Error(`ad ${response.status}`);
      return await response.json() as { kind: 'ad'; id: string; title: string; position: number };
    } catch { this.adFallbacks += 1; return null; }
  }

  private userId(authorization: string | undefined): string {
    const token = bearerToken(authorization);
    if (!token) throw new UnauthorizedException('Bearer token requerido');
    try { return verifyAccessToken(token, this.jwtSecret).sub; } catch { throw new UnauthorizedException('Bearer token invalido'); }
  }

  private applySocial(type: string, payload: { actor_id?: string; follower_id?: string; following_id?: string; video_id?: string }): void {
    if (type === 'social.liked' && payload.video_id) this.engagement.set(payload.video_id, (this.engagement.get(payload.video_id) ?? 0) + 1);
    if (type === 'social.followed' && payload.follower_id && payload.following_id) {
      const set = this.following.get(payload.follower_id) ?? new Set<string>();
      set.add(payload.following_id); this.following.set(payload.follower_id, set);
    }
    if (type === 'social.unfollowed' && payload.follower_id && payload.following_id) this.following.get(payload.follower_id)?.delete(payload.following_id);
  }

  private popularity(id: string, hashtags: string[]): number {
    const demoNumber = Number(id.match(/demo-video-(\d+)/)?.[1] ?? 0);
    const variation = demoNumber > 0 ? (demoNumber * 7) % 17 : [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 17;
    return hashtags.length * 10 + variation;
  }
}
