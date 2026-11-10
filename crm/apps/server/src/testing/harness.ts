/**
 * 集成测试脚手架：复制模板库 → 启动 Nest 应用 → 提供带鉴权的请求助手。
 * 模板库由 test/global-setup.ts 生成；每个 spec 使用独立副本。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import request from 'supertest';
import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import { PrismaService } from '../common/prisma.service';

export const PASSWORD = 'crm-test-2026';

export const ACCOUNTS = {
  admin: '13800001001',
  ops: '13800001002',
  finance: '13800001003',
  cs: '13800001004',
  store: '13800001005'
} as const;

export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

export type Harness = {
  app: INestApplication;
  prisma: PrismaService;
  dbFile: string;
  api: (method: HttpMethod, url: string, token?: string | null, body?: unknown) => request.Test;
  apiWithKey: (
    method: HttpMethod,
    url: string,
    token: string | null,
    body: unknown,
    key: string
  ) => request.Test;
  login: (username?: string, password?: string) => Promise<string>;
  close: () => Promise<void>;
};

/** 用假实现替换某个 provider（例如不打真实网络的轻疗客户端）。 */
export type HarnessOverride = {
  provide: Parameters<TestingModuleBuilder['overrideProvider']>[0];
  useValue: unknown;
};

export type HarnessOptions = {
  overrides?: HarnessOverride[];
};

let seq = 0;

async function locateTemplate(): Promise<string> {
  const root = path.join(os.tmpdir(), 'fullyu-crm-jest');
  const pointer = path.join(root, 'template.path');
  const started = Date.now();
  for (;;) {
    try {
      const fromPointer = fs.readFileSync(pointer, 'utf8').trim();
      if (fromPointer && fs.existsSync(fromPointer)) return fromPointer;
    } catch {
      // 指针尚未落盘，继续等待
    }
    if (Date.now() - started > 10000) {
      throw new Error('测试模板库不存在，请通过 pnpm test 运行（globalSetup 会生成）');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const template = await locateTemplate();
  const dbFile = path.join(
    os.tmpdir(),
    'fullyu-crm-jest',
    `run-${process.pid}-${Date.now()}-${(seq += 1)}.db`
  );
  fs.copyFileSync(template, dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;

  const builder = Test.createTestingModule({ imports: [AppModule] });
  for (const override of options.overrides || []) {
    builder.overrideProvider(override.provide).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.use(
    json({
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );
  app.use(urlencoded({ extended: true }));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  if (!app.getHttpServer().listening) await app.listen(0, '127.0.0.1');

  const api: Harness['api'] = (method, url, token, body) => {
    const req = request(app.getHttpServer())[method](`/api${url}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) req.send(body as object);
    return req;
  };
  const apiWithKey: Harness['apiWithKey'] = (method, url, token, body, key) =>
    api(method, url, token, body).set('Idempotency-Key', key);

  const login: Harness['login'] = async (username = ACCOUNTS.admin, password = PASSWORD) => {
    const res = await api('post', '/auth/login', null, { username, password });
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`登录失败 ${username}: ${res.status} ${res.text || ''}`);
    }
    return res.body.token as string;
  };

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    dbFile,
    api,
    apiWithKey,
    login,
    close: async () => {
      await app.close();
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        try {
          fs.rmSync(`${dbFile}${suffix}`, { force: true });
        } catch {
          // 忽略清理失败
        }
      }
    }
  };
}
