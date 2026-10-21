import { Body, Controller, Get, Headers, HttpException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { GatewayAuthGuard } from './gateway-auth.guard';

interface GatewayRequest { headers: Record<string, string | string[] | undefined>; }

@Controller('v1')
export class BusinessController {
  private readonly identityUrl = 'http://127.0.0.1:4001';

  @Post('auth/register') register(@Body() body: unknown) { return this.forward('/v1/auth/register', { method: 'POST', body }); }
  @Post('auth/token') token(@Body() body: unknown) { return this.forward('/v1/auth/token', { method: 'POST', body }); }
  @Post('auth/introspect') introspect(@Body() body: unknown) { return this.forward('/v1/auth/introspect', { method: 'POST', body }); }

  @Get('users/me')
  @UseGuards(GatewayAuthGuard)
  me(@Req() request: GatewayRequest) { const authorization = this.header(request, 'authorization'); return this.forward('/v1/users/me', { method: 'GET', ...(authorization ? { authorization } : {}) }); }

  @Patch('users/me')
  @UseGuards(GatewayAuthGuard)
  updateMe(@Req() request: GatewayRequest, @Body() body: unknown) { const authorization = this.header(request, 'authorization'); return this.forward('/v1/users/me', { method: 'PATCH', body, ...(authorization ? { authorization } : {}) }); }

  @Get('users/:id') user(@Param('id') id: string) { return this.forward(`/v1/users/${encodeURIComponent(id)}`, { method: 'GET' }); }

  private async forward(path: string, init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown; authorization?: string }): Promise<unknown> {
    try {
      const response = await fetch(`${this.identityUrl}${path}`, {
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
