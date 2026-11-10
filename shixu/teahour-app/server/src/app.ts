import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { Database as DatabaseType } from 'better-sqlite3';
import { ApiError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { customerRoutes } from './routes/customer.js';
import { storeRoutes } from './routes/store.js';
import { adminRoutes } from './routes/admin.js';

const here = dirname(fileURLToPath(import.meta.url));

export type BuildAppOptions = {
  db: DatabaseType;
  jwtSecret?: string;
  logger?: boolean;
  webRoot?: string;
};

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true
  });

  const secret =
    options.jwtSecret ||
    process.env.JWT_SECRET ||
    'dev-only-teahour-secret-change-me-before-production';
  await app.register(jwt, { secret });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: error.code || 'ERROR',
        message: error.message,
        details: error.details
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'VALIDATION',
        message: '请求参数不完整或格式不正确',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 401) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '请先登录' });
    }
    req.log.error(error);
    return reply.code(500).send({ error: 'SERVER_ERROR', message: '服务暂时不可用，请稍后重试' });
  });

  const db = options.db;
  await app.register(
    async (scope) => {
      await authRoutes(scope, { db });
      await customerRoutes(scope, { db });
      await storeRoutes(scope, { db });
      await adminRoutes(scope, { db });
    },
    { prefix: '/api' }
  );

  app.get('/api/health', async () => ({
    ok: true,
    time: Date.now(),
    hardware: 'mock',
    note: '支付、打印、泡茶机、平台与会员均为预留适配接口，未连接真实设备'
  }));

  const webRoot = options.webRoot || resolve(here, '../../web/dist');
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  }

  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api/')) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: '接口不存在' });
    }
    if (existsSync(webRoot)) {
      return reply.sendFile('index.html');
    }
    return reply
      .code(503)
      .type('text/plain; charset=utf-8')
      .send('前端尚未构建。请运行 npm run build:web，或使用 npm run dev 启动 Vite 开发服务器。');
  });

  return app;
}
