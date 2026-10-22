import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EventBusClient } from '@kipu/events';
import { bearerToken, verifyAccessToken, type AccessClaims, type Role } from '@kipu/auth';

export type VideoStatus = 'UPLOADING' | 'UPLOADED' | 'TRANSCODING' | 'MODERATING' | 'PUBLISHED' | 'REJECTED' | 'FAILED' | 'DELETED';
export interface UploadBody { filename?: string; content_type?: string; content_base64?: string; title?: string; description?: string; hashtags?: string[]; location?: string; }
export interface VideoRecord { id: string; owner_id: string; owner_role: Role; filename: string; content_type: 'video/mp4'; size_bytes: number; title: string; description: string; hashtags: string[]; location?: string; status: VideoStatus; created_at: string; updated_at: string; deleted_at?: string; }
export interface PublicVideo extends VideoRecord { }

interface Authenticated { claims: AccessClaims; }

interface TranscodeResult { video_id: string; title: string; owner_id: string; }

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private readonly videos = new Map<string, VideoRecord>();
  private readonly storage = path.join(process.cwd(), 'apps', 'media-service', '.data');
  private readonly events = new EventBusClient(process.env.KIPU_EVENT_BUS_URL ?? 'http://127.0.0.1:4010');
  private readonly jwtSecret = process.env.KIPU_JWT_SECRET ?? 'kipu-local-development-secret-change-me';
  private readonly playbackSecret = process.env.KIPU_MEDIA_SECRET ?? 'kipu-local-media-secret-change-me';
  private polling = true;

  onModuleInit(): void { void this.consumeWorkerEvents(); }
  onModuleDestroy(): void { this.polling = false; }

  async createUpload(authorization: string | undefined, body: UploadBody): Promise<VideoRecord> {
    const auth = this.authenticate(authorization);
    if (auth.claims.role !== 'CREATOR') throw new ForbiddenException('Solo CREATOR puede subir videos');
    if (!body.filename || body.content_type !== 'video/mp4' || !body.content_base64) throw new BadRequestException('Se requiere un MP4 en base64');
    const content = Buffer.from(body.content_base64, 'base64');
    if (content.length === 0 || content.length > 10 * 1024 * 1024) throw new BadRequestException('El MP4 debe pesar entre 1 byte y 10 MB');
    if (content.length < 8 || content.subarray(4, 8).toString('ascii') !== 'ftyp') throw new BadRequestException('El archivo no parece un MP4 válido');
    if ((body.title ?? '').length > 100 || (body.description ?? '').length > 2200 || (body.hashtags?.length ?? 0) > 30) throw new BadRequestException('Metadatos fuera de límites');
    const id = randomUUID();
    await mkdir(this.storage, { recursive: true });
    await writeFile(this.filePath(id), content, { flag: 'wx' });
    const now = new Date().toISOString();
    const video: VideoRecord = {
      id, owner_id: auth.claims.sub, owner_role: auth.claims.role, filename: body.filename, content_type: 'video/mp4', size_bytes: content.length,
      title: body.title ?? '', description: body.description ?? '', hashtags: body.hashtags ?? [], ...(body.location ? { location: body.location } : {}),
      status: 'UPLOADING', created_at: now, updated_at: now,
    };
    this.videos.set(id, video);
    return this.copy(video);
  }

  async seedDemo(): Promise<{ created: number; skipped: boolean }> {
    if (this.videos.size > 0) return { created: 0, skipped: true };
    const demoVideos = [
      ['Paisaje andino al amanecer', ['naturaleza', 'peru']], ['Receta rapida de quinua', ['cocina', 'salud']],
      ['Musica para concentrarse', ['musica', 'estudio']], ['Gato curioso en casa', ['mascotas', 'humor']],
      ['Consejos para grabar mejor', ['creadores', 'video']], ['Lima en tres colores', ['viajes', 'lima']],
      ['Ideas de reciclaje', ['ambiente', 'ideas']], ['Dibujo paso a paso', ['arte', 'tutorial']],
      ['Entrenamiento de cinco minutos', ['deporte', 'salud']], ['Lectura de domingo', ['libros', 'cultura']],
      ['Video en revision [revision]', ['demo', 'revision']], ['Video rechazado [rechazo]', ['demo', 'moderacion']],
    ] as const;
    const content = Buffer.from('AAAAFHNlZWQtbWluaS1tcDQ=', 'base64');
    await mkdir(this.storage, { recursive: true });
    for (let index = 0; index < demoVideos.length; index += 1) {
      const entry = demoVideos[index];
      if (!entry) continue;
      const [title, hashtags] = entry;
      const id = `demo-video-${index + 1}`;
      const now = new Date().toISOString();
      await writeFile(this.filePath(id), content, { flag: 'wx' }).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
      const video: VideoRecord = {
        id, owner_id: `demo-creator-${(index % 2) + 1}`, owner_role: 'CREATOR', filename: `${id}.mp4`, content_type: 'video/mp4', size_bytes: content.length,
        title, description: 'Video generado para la demostracion local', hashtags: [...hashtags], status: 'TRANSCODING', created_at: now, updated_at: now,
      };
      this.videos.set(id, video);
      await this.events.publish({ type: 'video.uploaded', payload: this.copy(video), idempotency_key: `video.uploaded:${id}` });
    }
    return { created: demoVideos.length, skipped: false };
  }

  async completeUpload(authorization: string | undefined, id: string): Promise<VideoRecord> {
    const video = this.find(id);
    this.requireOwner(video, authorization);
    if (video.status !== 'UPLOADING') throw new ConflictException(`No se puede completar desde ${video.status}`);
    video.status = 'TRANSCODING'; video.updated_at = new Date().toISOString();
    void this.events.publish({ type: 'video.uploaded', payload: this.copy(video), idempotency_key: `video.uploaded:${id}` }).catch(() => undefined);
    return this.copy(video);
  }

  getVideo(authorization: string | undefined, id: string): VideoRecord {
    const video = this.find(id);
    if (video.status !== 'PUBLISHED') this.requireOwnerOrModerator(video, authorization);
    return this.copy(video);
  }

  getPlayback(authorization: string | undefined, id: string): { video_id: string; url: string; expires_at: string } {
    const video = this.find(id);
    if (video.status !== 'PUBLISHED') throw new ConflictException('El video todavía no está publicado');
    const auth = this.authenticate(authorization);
    const expires = Math.floor(Date.now() / 1000) + 5 * 60;
    const token = this.signPlayback(id, auth.claims.sub, expires);
    return { video_id: id, url: `/v1/videos/${encodeURIComponent(id)}/playback/file?token=${encodeURIComponent(token)}`, expires_at: new Date(expires * 1000).toISOString() };
  }

  async readPlayback(authorization: string | undefined, id: string, token: string | undefined): Promise<Buffer> {
    const video = this.find(id);
    if (video.status !== 'PUBLISHED') throw new ConflictException('El video todavía no está publicado');
    const auth = this.authenticate(authorization);
    if (!token || !this.verifyPlayback(token, id, auth.claims.sub)) throw new UnauthorizedException('URL de reproducción inválida o vencida');
    return readFile(this.filePath(id));
  }

  async deleteVideo(authorization: string | undefined, id: string): Promise<{ deleted: true; video_id: string }> {
    const video = this.find(id);
    this.requireOwnerOrModerator(video, authorization);
    video.status = 'DELETED'; video.deleted_at = new Date().toISOString(); video.updated_at = video.deleted_at;
    void this.events.publish({ type: 'video.deleted', payload: { video_id: id, owner_id: video.owner_id, deleted_at: video.deleted_at }, idempotency_key: `video.deleted:${id}` }).catch(() => undefined);
    return { deleted: true, video_id: id };
  }

  private async consumeWorkerEvents(): Promise<void> {
    while (this.polling) {
      try {
        const delivery = await this.events.consume<TranscodeResult | { video_id: string }>({ group: 'media-service', consumer: 'media-service-1' });
        if (delivery) {
          if (delivery.event.type === 'video.transcoded') await this.handleTranscoded(delivery.event.payload as TranscodeResult);
          if (delivery.event.type === 'video.failed') await this.handleFailed(delivery.event.payload as { video_id: string });
          await this.events.confirm({ group: 'media-service', consumer: 'media-service-1', delivery_id: delivery.delivery_id });
        }
      } catch { /* El bus puede estar iniciando; una entrega no confirmada se reintenta. */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async handleTranscoded(result: TranscodeResult): Promise<void> {
    const video = this.videos.get(result.video_id);
    if (!video || video.status === 'DELETED' || video.status === 'PUBLISHED' || video.status === 'REJECTED') return;
    video.status = 'MODERATING'; video.updated_at = new Date().toISOString();
    const title = video.title.toLowerCase();
    if (title.includes('[revision]') || title.includes('[timeout]')) return;
    if (title.includes('[rechazo]')) {
      video.status = 'REJECTED'; video.updated_at = new Date().toISOString();
      await this.events.publish({ type: 'video.rejected', payload: { video_id: video.id, reason: 'moderacion_simulada' }, idempotency_key: `video.rejected:${video.id}` });
      return;
    }
    video.status = 'PUBLISHED'; video.updated_at = new Date().toISOString();
      await this.events.publish({ type: 'video.published', payload: { video_id: video.id, owner_id: video.owner_id, title: video.title, hashtags: video.hashtags, created_at: video.created_at }, idempotency_key: `video.published:${video.id}` });
  }

  private async handleFailed(result: { video_id: string }): Promise<void> {
    const video = this.videos.get(result.video_id);
    if (!video || video.status === 'DELETED' || video.status === 'PUBLISHED' || video.status === 'REJECTED') return;
    video.status = 'FAILED'; video.updated_at = new Date().toISOString();
  }

  private authenticate(authorization: string | undefined): Authenticated {
    const token = bearerToken(authorization);
    if (!token) throw new UnauthorizedException('Bearer token requerido');
    try { return { claims: verifyAccessToken(token, this.jwtSecret) }; }
    catch { throw new UnauthorizedException('Bearer token inválido'); }
  }
  private requireOwner(video: VideoRecord, authorization: string | undefined): AccessClaims { const auth = this.authenticate(authorization); if (auth.claims.sub !== video.owner_id) throw new ForbiddenException('Solo el dueño puede modificar este video'); return auth.claims; }
  private requireOwnerOrModerator(video: VideoRecord, authorization: string | undefined): AccessClaims { const auth = this.authenticate(authorization); if (auth.claims.sub !== video.owner_id && auth.claims.role !== 'MODERATOR') throw new ForbiddenException('No tienes permiso sobre este video'); return auth.claims; }
  private find(id: string): VideoRecord { const video = this.videos.get(id); if (!video || video.status === 'DELETED') throw new NotFoundException('Video no encontrado'); return video; }
  private filePath(id: string): string { return path.join(this.storage, `${id}.mp4`); }
  private copy(video: VideoRecord): VideoRecord { return { ...video, hashtags: [...video.hashtags] }; }
  private signPlayback(videoId: string, userId: string, expires: number): string { const value = `${videoId}:${userId}:${expires}`; return `${Buffer.from(value).toString('base64url')}.${createHmac('sha256', this.playbackSecret).update(value).digest('base64url')}`; }
  private verifyPlayback(token: string, videoId: string, userId: string): boolean {
    const [encoded, received] = token.split('.');
    if (!encoded || !received) return false;
    const value = Buffer.from(encoded, 'base64url').toString('utf8');
    const [tokenVideo, tokenUser, expiresText] = value.split(':');
    const expected = createHmac('sha256', this.playbackSecret).update(value).digest('base64url');
    if (received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return false;
    return tokenVideo === videoId && tokenUser === userId && Number(expiresText) > Math.floor(Date.now() / 1000);
  }
}
