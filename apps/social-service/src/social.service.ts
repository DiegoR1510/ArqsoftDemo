import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { bearerToken, verifyAccessToken } from '@kipu/auth';
import { EventBusClient } from '@kipu/events';

export interface CommentRecord { id: string; video_id: string; author_id: string; text: string; parent_id?: string; created_at: string; }
interface Claims { sub: string; }

@Injectable()
export class SocialService {
  private readonly follows = new Set<string>();
  private readonly likes = new Map<string, Set<string>>();
  private readonly comments = new Map<string, CommentRecord>();
  private readonly blocks = new Set<string>();
  private readonly events = new EventBusClient(process.env.KIPU_EVENT_BUS_URL ?? 'http://127.0.0.1:4010');
  private readonly jwtSecret = process.env.KIPU_JWT_SECRET ?? 'kipu-local-development-secret-change-me';

  follow(authorization: string | undefined, targetId: string): { following: true; follower_id: string; following_id: string } {
    const actor = this.authenticate(authorization).sub;
    if (actor === targetId) throw new BadRequestException('No puedes seguirte a ti mismo');
    this.ensureAllowed(actor, targetId);
    const key = `${actor}:${targetId}`;
    if (!this.follows.has(key)) {
      this.follows.add(key);
      void this.events.publish({ type: 'social.followed', payload: { actor_id: actor, follower_id: actor, recipient_id: targetId, following_id: targetId }, idempotency_key: `social.followed:${key}` }).catch(() => undefined);
    }
    return { following: true, follower_id: actor, following_id: targetId };
  }

  unfollow(authorization: string | undefined, targetId: string): { following: false; follower_id: string; following_id: string } {
    const actor = this.authenticate(authorization).sub;
    this.follows.delete(`${actor}:${targetId}`);
    return { following: false, follower_id: actor, following_id: targetId };
  }

  like(authorization: string | undefined, videoId: string, body: { owner_id?: string }): { liked: true; video_id: string; count: number } {
    const actor = this.authenticate(authorization).sub;
    if (body.owner_id) this.ensureAllowed(actor, body.owner_id);
    const users = this.likes.get(videoId) ?? new Set<string>();
    const fresh = !users.has(actor);
    users.add(actor); this.likes.set(videoId, users);
    if (fresh) void this.events.publish({ type: 'social.liked', payload: { actor_id: actor, recipient_id: body.owner_id, video_id: videoId }, idempotency_key: `social.liked:${actor}:${videoId}` }).catch(() => undefined);
    return { liked: true, video_id: videoId, count: users.size };
  }

  comment(authorization: string | undefined, videoId: string, body: { text?: string; parent_id?: string; owner_id?: string }): CommentRecord {
    const actor = this.authenticate(authorization).sub;
    if (!body.text?.trim()) throw new BadRequestException('El comentario no puede estar vacio');
    if (body.owner_id) this.ensureAllowed(actor, body.owner_id);
    if (body.parent_id && !this.comments.has(body.parent_id)) throw new NotFoundException('Comentario padre no encontrado');
    if (body.parent_id && this.comments.get(body.parent_id)?.parent_id) throw new BadRequestException('Solo se permite un nivel de respuesta');
    const id = `${videoId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const comment: CommentRecord = { id, video_id: videoId, author_id: actor, text: body.text.trim().slice(0, 500), ...(body.parent_id ? { parent_id: body.parent_id } : {}), created_at: new Date().toISOString() };
    this.comments.set(id, comment);
    void this.events.publish({ type: 'social.commented', payload: { actor_id: actor, recipient_id: body.owner_id, video_id: videoId, comment_id: id, text: comment.text }, idempotency_key: `social.commented:${id}` }).catch(() => undefined);
    return comment;
  }

  listComments(authorization: string | undefined, videoId: string): CommentRecord[] {
    const viewer = this.authenticate(authorization).sub;
    return [...this.comments.values()].filter((comment) => comment.video_id === videoId && !this.blocks.has(`${viewer}:${comment.author_id}`));
  }

  block(authorization: string | undefined, targetId: string): { blocked: true; blocker_id: string; blocked_id: string } {
    const actor = this.authenticate(authorization).sub;
    if (actor === targetId) throw new BadRequestException('No puedes bloquearte a ti mismo');
    this.blocks.add(`${actor}:${targetId}`);
    void this.events.publish({ type: 'social.blocked', payload: { actor_id: actor, blocker_id: actor, blocked_id: targetId }, idempotency_key: `social.blocked:${actor}:${targetId}` }).catch(() => undefined);
    return { blocked: true, blocker_id: actor, blocked_id: targetId };
  }

  counters(authorization: string | undefined, body: { video_ids?: string[] }): { counters: Array<{ video_id: string; likes: number; comments: number }> } {
    this.authenticate(authorization);
    const ids = body.video_ids ?? [];
    return { counters: ids.map((video_id) => ({ video_id, likes: this.likes.get(video_id)?.size ?? 0, comments: [...this.comments.values()].filter((comment) => comment.video_id === video_id).length })) };
  }

  private ensureAllowed(actor: string, target: string): void {
    if (this.blocks.has(`${target}:${actor}`) || this.blocks.has(`${actor}:${target}`)) throw new ForbiddenException('La relacion esta bloqueada');
  }
  private authenticate(authorization: string | undefined): Claims {
    const token = bearerToken(authorization);
    if (!token) throw new UnauthorizedException('Bearer token requerido');
    try { return verifyAccessToken(token, this.jwtSecret); } catch { throw new UnauthorizedException('Bearer token invalido'); }
  }
}
