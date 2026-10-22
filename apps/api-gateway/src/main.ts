import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { getService } from '@kipu/contracts';
import { logLifecycle } from '@kipu/observability';
import { AppModule } from './app.module';
import { ApiManagementService } from './api-management.service';
import { HttpException } from '@nestjs/common';

interface GatewayRequest { method: string; path: string; socket: { remoteAddress?: string }; }
interface GatewayResponse { statusCode: number; on(event: 'finish', callback: () => void): void; header(name: string, value: string): unknown; status(code: number): GatewayResponse; json(body: unknown): void; }

async function bootstrap(): Promise<void> {
  const definition = getService('api-gateway');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.getHttpAdapter().getInstance().use(json({ limit: '15mb' }));
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  app.enableCors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'] });
  const apiManagement = app.get(ApiManagementService);
  app.use((request: GatewayRequest, response: GatewayResponse, next: (error?: unknown) => void) => {
    const started = Date.now();
    response.on('finish', () => apiManagement.record(request.method, request.path, response.statusCode, Date.now() - started));
    if (request.method === 'POST' && (request.path === '/v1/auth/register' || request.path === '/v1/auth/token')) {
      try { apiManagement.enforce('auth', request.socket.remoteAddress ?? 'unknown', response); }
      catch (error) {
        if (error instanceof HttpException) { response.status(error.getStatus()).json({ statusCode: error.getStatus(), message: error.message }); return; }
        next(error); return;
      }
    }
    next();
  });
  await app.listen(definition.port, '127.0.0.1');
  logLifecycle(definition.service, 'started', { port: definition.port });
}

void bootstrap().catch((error: unknown) => {
  logLifecycle('api-gateway', 'failed', { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
