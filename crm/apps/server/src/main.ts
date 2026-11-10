import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { allowedOrigins } from './config';
import { loadLocalEnv } from './env';

loadLocalEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'], rawBody: true });
  app.setGlobalPrefix('api');
  const origins = allowedOrigins();
  app.enableCors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Idempotency-Key'],
    maxAge: 600
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 愈行之旅要嵌在三端小程序的 web-view 里，不能禁止被框架承载。
    if (!req.path.startsWith('/game')) res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // 零构建管理后台：与 API 同源部署，避免额外静态服务器与跨域配置。
  const adminDir = path.resolve(__dirname, '../../admin/public');
  app.use(
    '/admin',
    express.static(adminDir, {
      index: 'index.html',
      etag: true,
      setHeaders(res) {
        // 后台文件很小，强制回源校验，避免发布后浏览器沿用旧脚本。
        res.setHeader('Cache-Control', 'no-cache');
      }
    })
  );
  // 愈行之旅 H5：与 API 同源，票据换会话后不接触任何签名密钥。
  const gameDir = path.resolve(__dirname, '../../game');
  app.use(
    '/game',
    express.static(gameDir, {
      index: 'index.html',
      etag: true,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    })
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && req.path === '/') return res.redirect('/admin/');
    return next();
  });

  app.useGlobalFilters(new ApiExceptionFilter());
  const port = Number(process.env.PORT || 3000);
  const host = (process.env.HOST || '').trim();
  if (host) await app.listen(port, host);
  else await app.listen(port);
}

void bootstrap();
