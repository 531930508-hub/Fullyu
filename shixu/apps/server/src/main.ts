import 'reflect-metadata';
import { mkdirSync } from 'node:fs';
import express, { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { BODY_LIMIT, UPLOAD_ROOT, UPLOAD_URL_PREFIX } from './common/assets';
import { allowedOrigins } from './config/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn', 'log'] });
  // 头像走 base64 直传，限额需覆盖 2MB 图片编码后的体积。
  // 同时保留一份原始请求体：支付渠道回调验签必须用它，不能用重新序列化的 JSON。
  app.use(
    json({
      limit: BODY_LIMIT,
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      }
    })
  );
  // 汇付等渠道的异步通知是 form-urlencoded，验签同样必须用原始请求体。
  app.use(
    urlencoded({
      extended: true,
      limit: BODY_LIMIT,
      verify: (req, _res, buf) => {
        const target = req as Request & { rawBody?: string };
        if (!target.rawBody) target.rawBody = buf.toString('utf8');
      }
    })
  );
  // 部署在 Nginx 之后，限流必须看到真实客户端 IP；只信任一层代理。
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  mkdirSync(UPLOAD_ROOT, { recursive: true });
  // 商品图/头像文件名带随机后缀，内容一旦落盘就不再变化，可以长期强缓存；
  // 换图会生成新 key，不会出现旧图缓存无法更新的问题。
  app.use(
    UPLOAD_URL_PREFIX,
    express.static(UPLOAD_ROOT, { maxAge: '365d', immutable: true, index: false })
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });
  // 小程序与服务器调用不带 Origin，必须放行；浏览器来源按白名单校验，
  // 避免任意站点借用户浏览器调用带 Bearer 的接口。
  const origins = allowedOrigins();
  app.enableCors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    maxAge: 600
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  const port = Number(process.env.PORT || 8787);
  await app.listen(port);
  Logger.log(`时叙 API 已启动：http://localhost:${port}/api/health`, 'Bootstrap');
}

void bootstrap();
