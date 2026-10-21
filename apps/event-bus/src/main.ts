import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getService } from '@kipu/contracts';
import { logLifecycle } from '@kipu/observability';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const definition = getService('event-bus');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  await app.listen(definition.port, '127.0.0.1');
  logLifecycle(definition.service, 'started', { port: definition.port });
}

void bootstrap().catch((error: unknown) => {
  logLifecycle('event-bus', 'failed', { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
