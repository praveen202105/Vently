import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 4000);
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:3000');

  app.use(helmet());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.enableCors({
    origin: corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix('api', { exclude: ['health'] });

  // Wire the Socket.io Redis adapter so multiple api replicas share state.
  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);

  await app.listen(port);
  Logger.log(`Vently API listening on :${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
