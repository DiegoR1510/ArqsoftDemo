import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { GatewayAuthGuard } from './gateway-auth.guard';

interface GatewayRequest { headers: Record<string, string | string[] | undefined>; }
interface HttpResponse { status(code: number): HttpResponse; header(name: string, value: string): HttpResponse; send(body: Buffer): void; }

@Controller('v1')
export class BusinessController {
  private readonly identityUrl = 'http://127.0.0.1:4001';
  private readonly mediaUrl = 'http://127.0.0.1:4002';
  private readonly feedUrl = 'http://127.0.0.1:4003';

  @Post('auth/register') register(@Body() body: unknown) { return this.forward('/v1/auth/register', { method: 'POST', body }); }
  @Post('auth/token') token(@Body() body: unknown) { return this.forward('/v1/auth/token', { method: 'POST', body }); }
  @Post('auth/introspect') introspect(@Body() body: unknown) { return this.forward('/v1/auth/introspect', { method: 'POST', body }); }

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

  private async forward(path: string, init: { target?: 'identity' | 'media' | 'feed'; method: 'DELETE' | 'GET' | 'POST' | 'PATCH'; body?: unknown; authorization?: string | undefined }): Promise<unknown> {
    try {
      const target = init.target === 'media' ? this.mediaUrl : init.target === 'feed' ? this.feedUrl : this.identityUrl;
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
