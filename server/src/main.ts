import 'reflect-metadata';
// Allow BigInt fields (e.g. video sizeBytes up to 10 GB) to serialize in JSON
// responses as plain numbers (safe: 10 GB is far below Number.MAX_SAFE_INTEGER).
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';
import { validateEnv } from './config/validate-env';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  // Fail fast on bad config (prod) / warn (dev). Also defaults DIRECT_URL.
  validateEnv();

  const app = await NestFactory.create(AppModule, { cors: false });

  const origins = (process.env.WEB_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.use(json({ limit: '5mb' }));

  // ---------------------------------------------------------------------------
  // Realtime adapter. Use Redis (Upstash in prod / local redis in dev) so
  // Socket.IO broadcasts fan out across instances. Falls back to in-memory if
  // REDIS_URL is unset or Redis is unreachable — the dev workflow is unaffected.
  // ---------------------------------------------------------------------------
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const redisAdapter = new RedisIoAdapter(app);
    const connected = await redisAdapter.connectToRedis(redisUrl);
    if (connected) {
      app.useWebSocketAdapter(redisAdapter);
    }
  } else {
    Logger.warn(
      'REDIS_URL not set — Socket.IO using the in-memory adapter (single instance only).',
      'Bootstrap',
    );
  }

  // Render (and most PaaS) inject PORT. Always bind 0.0.0.0 so the platform's
  // health checks and router can reach the container.
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API + realtime listening on :${port} (CORS origins: ${origins.join(', ')})`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[streamy] fatal during bootstrap:', err);
  process.exit(1);
});
