import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { getService } from '@kipu/contracts';
import { logLifecycle } from '@kipu/observability';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const definition = getService('api-gateway');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.getHttpAdapter().getInstance().use(json({ limit: '15mb' }));
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  app.enableCors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] });
  await app.listen(definition.port, '127.0.0.1');
  logLifecycle(definition.service, 'started', { port: definition.port });
}

void bootstrap().catch((error: unknown) => {
  logLifecycle('api-gateway', 'failed', { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
