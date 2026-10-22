import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { GatewayAuthGuard } from './gateway-auth.guard';
import { requireDemoMode } from './demo-mode';

interface GatewayRequest { headers: Record<string, string | string[] | undefined>; }
interface HttpResponse { status(code: number): HttpResponse; header(name: string, value: string): HttpResponse; send(body: Buffer): void; }

@Controller('v1')
export class BusinessController {
  private readonly identityUrl = 'http://127.0.0.1:4001';
  private readonly mediaUrl = 'http://127.0.0.1:4002';
  private readonly feedUrl = 'http://127.0.0.1:4003';
  private readonly socialUrl = 'http://127.0.0.1:4004';
  private readonly notificationUrl = 'http://127.0.0.1:4012';
  private readonly rankingUrl = 'http://127.0.0.1:4011';
  private readonly eventBusUrl = 'http://127.0.0.1:4010';
  private readonly stubsUrl = 'http://127.0.0.1:4020';

  @Post('auth/register') register(@Body() body: unknown) { return this.forward('/v1/auth/register', { method: 'POST', body }); }
  @Post('auth/token') token(@Body() body: unknown) { return this.forward('/v1/auth/token', { method: 'POST', body }); }
  @Post('auth/introspect') introspect(@Body() body: unknown) { return this.forward('/v1/auth/introspect', { method: 'POST', body }); }
  @Post('auth/demo/seed') demoSeed() { requireDemoMode(); return this.forward('/v1/auth/internal/demo/seed', { method: 'POST' }); }

  @Post('demo/ranking/mode') rankingMode(@Body() body: unknown) { requireDemoMode(); return this.forward('/internal/ranking/mode', { target: 'ranking', method: 'POST', body }); }
  @Post('demo/ranking/ruleset') rankingRuleset(@Body() body: unknown) { requireDemoMode(); return this.forward('/internal/ranking/ruleset', { target: 'ranking', method: 'POST', body }); }
  @Post('demo/ad-server/latency') adLatency(@Body() body: unknown) { requireDemoMode(); return this.forward('/internal/ad-server/latency', { target: 'stubs', method: 'POST', body }); }
  @Get('demo/status') demoStatus() { requireDemoMode(); return this.demoStatusSnapshot(); }
  @Get('demo/events') demoEvents() { requireDemoMode(); return this.forward('/debug/events', { target: 'event-bus', method: 'GET' }); }
  @Get('demo/dead-letters') demoDeadLetters() { requireDemoMode(); return this.forward('/debug/dead-letters', { target: 'event-bus', method: 'GET' }); }

  @Post('uploads')
  @UseGuards(GatewayAuthGuard)
  upload(@Req() request: GatewayRequest, @Body() body: unknown) { return this.forward('/v1/uploads', { target: 'media', method: 'POST', body, authorization: this.header(request, 'authorization') }); }

  @Post('uploads/:id/complete')
  @UseGuards(GatewayAuthGuard)
  completeUpload(@Req() request: GatewayRequest, @Param('id') id: string) { return this.forward(`/v1/uploads/${encodeURIComponent(id)}/complete`, { target: 'media', method: 'POST', authorization: this.header(request, 'authorization') }); }

  @Get('videos/:id') video(@Req() request: GatewayRequest, @Param('id') id: string) { return this.forward(`/v1/videos/${encodeURIComponent(id)}`, { target: 'media', method: 'GET', authorization: this.header(request, 'authorization') }); }

  @Get('videos/:id/playback')
  @UseGuards(GatewayAuthGuard)
  playback(@Req() request: GatewayRequest, @Param('id') id: string) { return this.forward(`/v1/videos/${encodeURIComponent(id)}/playback`, { target: 'media', method: 'GET', authorization: this.header(request, 'authorization') }); }

  @Get('videos/:id/playback/file')
  @UseGuards(GatewayAuthGuard)
  async playbackFile(@Req() request: GatewayRequest, @Param('id') id: string, @Query('token') token: string | undefined, @Res() response: HttpResponse): Promise<void> {
    const upstream = await fetch(`${this.mediaUrl}/v1/videos/${encodeURIComponent(id)}/playback/file?token=${encodeURIComponent(token ?? '')}`, { headers: { authorization: this.header(request, 'authorization') ?? '' } });
    const content = Buffer.from(await upstream.arrayBuffer());
    if (!upstream.ok) throw new HttpException(content.toString('utf8'), upstream.status);
    response.status(200).header('content-type', 'video/mp4').send(content);
  }

  @Delete('videos/:id')
  @UseGuards(GatewayAuthGuard)
  deleteVideo(@Req() request: GatewayRequest, @Param('id') id: string) { return this.forward(`/v1/videos/${encodeURIComponent(id)}`, { target: 'media', method: 'DELETE', authorization: this.header(request, 'authorization') }); }

  @Get('users/me')
  @UseGuards(GatewayAuthGuard)
  me(@Req() request: GatewayRequest) { const authorization = this.header(request, 'authorization'); return this.forward('/v1/users/me', { method: 'GET', ...(authorization ? { authorization } : {}) }); }

  @Patch('users/me')
  @UseGuards(GatewayAuthGuard)
  updateMe(@Req() request: GatewayRequest, @Body() body: unknown) { const authorization = this.header(request, 'authorization'); return this.forward('/v1/users/me', { method: 'PATCH', body, ...(authorization ? { authorization } : {}) }); }

  @Get('users/:id') user(@Param('id') id: string) { return this.forward(`/v1/users/${encodeURIComponent(id)}`, { method: 'GET' }); }

  @Get('feed')
  @UseGuards(GatewayAuthGuard)
  feed(@Req() request: GatewayRequest, @Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.forward(`/v1/feed?cursor=${encodeURIComponent(cursor ?? '')}&limit=${encodeURIComponent(limit ?? '')}`, { target: 'feed', method: 'GET', authorization: this.header(request, 'authorization') }); }

  @Get('search') search(@Query('q') query?: string, @Query('hashtag') hashtag?: string) { return this.forward(`/v1/search?q=${encodeURIComponent(query ?? '')}&hashtag=${encodeURIComponent(hashtag ?? '')}`, { target: 'feed', method: 'GET' }); }

  @Post('feed/viewed')
  @UseGuards(GatewayAuthGuard)
  viewed(@Req() request: GatewayRequest, @Body() body: unknown) { return this.forward('/v1/feed/viewed', { target: 'feed', method: 'POST', body, authorization: this.header(request, 'authorization') }); }

  @Get('feed/following')
  @UseGuards(GatewayAuthGuard)
  following(@Req() request: GatewayRequest) { return this.forward('/v1/feed/following', { target: 'feed', method: 'GET', authorization: this.header(request, 'authorization') }); }

  @Post('social/follow/:id')
  @UseGuards(GatewayAuthGuard)
  follow(@Req() request: GatewayRequest, @Param('id') id: string) { return this.forward(`/v1/social/follow/${encodeURIComponent(id)}`, { target: 'social', method: 'POST', authorization: this.header(request, 'authorization') }); }

  @Delete('social/follow/:id')
  @UseGuards(GatewayAuthGuard)
  unfollow(@Req() request: GatewayRequest, @Param('id') id: string) { return this.forward(`/v1/social/follow/${encodeURIComponent(id)}`, { target: 'social', method: 'DELETE', authorization: this.header(request, 'authorization') }); }

  @Post('social/videos/:id/like')
  @UseGuards(GatewayAuthGuard)
  like(@Req() request: GatewayRequest, @Param('id') id: string, @Body() body: unknown) { return this.forward(`/v1/social/videos/${encodeURIComponent(id)}/like`, { target: 'social', method: 'POST', body, authorization: this.header(request, 'authorization') }); }

  @Post('social/videos/:id/comments')
  @UseGuards(GatewayAuthGuard)
  comment(@Req() request: GatewayRequest, @Param('id') id: string, @Body() body: unknown) { return this.forward(`/v1/social/videos/${encodeURIComponent(id)}/comments`, { target: 'social', method: 'POST', body, authorization: this.header(request, 'authorization') }); }

  @Get('social/videos/:id/comments')
  @UseGuards(GatewayAuthGuard)
  comments(@Req() request: GatewayRequest, @Param('id') id: string) { return this.forward(`/v1/social/videos/${encodeURIComponent(id)}/comments`, { target: 'social', method: 'GET', authorization: this.header(request, 'authorization') }); }

  @Post('social/block/:id')
  @UseGuards(GatewayAuthGuard)
  block(@Req() request: GatewayRequest, @Param('id') id: string) { return this.forward(`/v1/social/block/${encodeURIComponent(id)}`, { target: 'social', method: 'POST', authorization: this.header(request, 'authorization') }); }

  @Post('social/counters/batch')
  @UseGuards(GatewayAuthGuard)
  counters(@Req() request: GatewayRequest, @Body() body: unknown) { return this.forward('/v1/social/counters/batch', { target: 'social', method: 'POST', body, authorization: this.header(request, 'authorization') }); }

  @Get('notifications')
  @UseGuards(GatewayAuthGuard)
  notifications(@Req() request: GatewayRequest) { return this.forward('/v1/notifications', { target: 'notifications', method: 'GET', authorization: this.header(request, 'authorization') }); }

  private async demoStatusSnapshot(): Promise<unknown> {
    const [services, ruleset, metrics] = await Promise.all([
      fetch('http://127.0.0.1:4000/health/services').then((response) => response.json()),
      this.forward('/internal/ranking/ruleset', { target: 'ranking', method: 'GET' }),
      this.forward('/internal/metrics', { target: 'feed', method: 'GET' }),
    ]);
    return { services, ruleset, metrics };
  }

  private async forward(path: string, init: { target?: 'identity' | 'media' | 'feed' | 'social' | 'notifications' | 'ranking' | 'event-bus' | 'stubs'; method: 'DELETE' | 'GET' | 'POST' | 'PATCH'; body?: unknown; authorization?: string | undefined }): Promise<unknown> {
    try {
      const target = init.target === 'media' ? this.mediaUrl : init.target === 'feed' ? this.feedUrl : init.target === 'social' ? this.socialUrl : init.target === 'notifications' ? this.notificationUrl : init.target === 'ranking' ? this.rankingUrl : init.target === 'event-bus' ? this.eventBusUrl : init.target === 'stubs' ? this.stubsUrl : this.identityUrl;
      const response = await fetch(`${target}${path}`, {
        method: init.method,
        headers: { ...(init.body === undefined ? {} : { 'content-type': 'application/json' }), ...(init.authorization ? { authorization: init.authorization } : {}) },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) : undefined;
      if (!response.ok) throw new HttpException(payload ?? { message: 'Identity service rechazó la petición' }, response.status);
      return payload;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ message: 'Identity service no disponible' }, 503);
    }
  }

  private header(request: GatewayRequest, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
