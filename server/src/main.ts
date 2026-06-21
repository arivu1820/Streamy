import 'reflect-metadata';
// Allow BigInt fields (e.g. video sizeBytes up to 10 GB) to serialize in JSON
// responses as plain numbers (safe: 10 GB is far below Number.MAX_SAFE_INTEGER).
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });

  app.enableCors({
    origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.use(json({ limit: '5mb' }));

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[streamy] API + realtime listening on http://localhost:${port}`);
}
bootstrap();
