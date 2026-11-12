/**
 * 集成测试脚手架：克隆模板库 → 启动 Nest 应用 → 提供带鉴权的请求助手。
 * 模板由 test/global-setup.ts 在 MySQL 里建好并 dump；每个 spec 克隆成独立库，测试之间互不污染。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDatabase,
  databaseUrl,
  dropDatabase,
  importDump,
  mysqlBase,
  testDatabaseName,
  type MysqlBase
} from './mysql-db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import request from 'supertest';
import { AppModule } from '../app.module';
import { BODY_LIMIT } from '../common/assets';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import { PrismaService } from '../common/prisma.service';

export const PASSWORD = 'teahour2026';

export const ACCOUNTS = {
  super: '13800000001',
  finance: '13800000002',
  region: '13800000003',
  managerSh: '13800000004',
  staffSh: '13800000005',
  audit: '13800000006'
} as const;

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type Harness = {
  app: INestApplication;
  prisma: PrismaService;
  /** 本 spec 独占的 MySQL 库名，排查数据时直接用它连库。 */
  database: string;
  api: (method: HttpMethod, url: string, token?: string | null, body?: unknown) => request.Test;
  login: (username?: string, password?: string) => Promise<string>;
  customer: (name?: string) => Promise<{ token: string; id: string; memberCode: string; phone: string }>;
  close: () => Promise<void>;
};

let seq = 0;

type Template = MysqlBase & { dump: string };

/** 读取 globalSetup 写入的模板指针（每次 jest 运行一份独立 dump，互不覆盖）。 */
async function locateTemplate(): Promise<Template> {
  const root = path.join(os.tmpdir(), 'teahour-jest');
  const pointer = path.join(root, 'template.path');
  const started = Date.now();
  for (;;) {
    try {
      const raw = fs.readFileSync(pointer, 'utf8').trim();
      const parsed = raw.startsWith('{') ? (JSON.parse(raw) as Template) : null;
      if (parsed && parsed.dump && fs.existsSync(parsed.dump)) return parsed;
    } catch {
      // 指针尚未落盘，继续等待
    }
    if (Date.now() - started > 10000) {
      throw new Error(
        '测试模板库不存在，请通过 pnpm --filter @teahour/server test 运行（globalSetup 会在 MySQL 里生成）'
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function createHarness(): Promise<Harness> {
  const found = await locateTemplate();
  const template: Template = found.user ? found : { ...mysqlBase(), dump: found.dump };
  const base: MysqlBase = {
    host: template.host,
    port: template.port,
    user: template.user,
    password: template.password
  };
  const database = testDatabaseName('run', `${Date.now()}_${(seq += 1)}`);
  createDatabase(base, database);
  try {
    importDump(base, database, template.dump);
  } catch (error) {
    dropDatabase(base, database);
    throw error;
  }
  process.env.DATABASE_URL = databaseUrl(base, database);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  // 与 main.ts 一致的请求体上限，保证头像 base64 直传在测试里走同一条路径；
  // 同时保留原始请求体，供支付回调验签用例使用。
  app.use(
    json({
      limit: BODY_LIMIT,
      verify: (req, _res, buf) => {
        (req as typeof req & { rawBody?: string }).rawBody = buf.toString('utf8');
      }
    })
  );
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  // 先固定监听一个随机端口：supertest 遇到未监听的 server 会自行 listen/close，
  // 连续请求时 close 尚未结束就再次 listen，会偶发 404 或 socket hang up。
  // 整个用例集复用同一个监听实例，请求之间不再反复起停。
  if (!app.getHttpServer().listening) await app.listen(0, '127.0.0.1');

  const api: Harness['api'] = (method, url, token, body) => {
    const req = request(app.getHttpServer())[method](`/api${url}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) req.send(body as object);
    return req;
  };

  const login: Harness['login'] = async (username = ACCOUNTS.super, password = PASSWORD) => {
    const res = await api('post', '/auth/login', null, { username, password });
    // Nest 对 POST 默认返回 201；这里兼容 200/201，避免因状态码细节埋没真正的失败原因。
    if (res.status !== 201 && res.status !== 200) {
      const detail = res.text || JSON.stringify(res.body ?? {});
      throw new Error(
        `登录失败 ${username}: ${res.status} ${detail} (content-type: ${res.headers['content-type'] || '—'})`
      );
    }
    return res.body.token as string;
  };

  let phoneSeq = 0;
  const customer: Harness['customer'] = async (name = 'QA 茶客') => {
    // 手机号是顾客唯一身份：测试顾客同样必须带手机号，
    // 用递增尾号保证同一个 spec 内互不撞号。
    phoneSeq += 1;
    const phone = `139${String(10000000 + phoneSeq).padStart(8, '0')}`;
    const res = await api('post', '/customer/session', null, { name, phone });
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`顾客会话失败: ${res.status} ${res.text}`);
    }
    return {
      token: res.body.token as string,
      id: res.body.customer.id as string,
      memberCode: res.body.customer.memberCode as string,
      phone
    };
  };

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    database,
    api,
    login,
    customer,
    close: async () => {
      await app.close();
      try {
        dropDatabase(base, database);
      } catch {
        // 忽略清理失败：残留库下次会被手动清掉，不影响本次结论
      }
    }
  };
}

/** 顾客下单体：默认上海·城市中心店堂食一杯醒·花园蜜香。 */
export function freshOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    storeId: 'sh',
    business: 'fresh',
    type: 'dine',
    seat: '吧台01',
    items: [{ productId: 'xing-0', qty: 1, temp: '热', ice: null }],
    ...overrides
  };
}

export function retailOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    storeId: 'brand',
    business: 'retail',
    type: 'retail',
    items: [{ productId: 'bottle', qty: 1 }],
    ...overrides
  };
}
