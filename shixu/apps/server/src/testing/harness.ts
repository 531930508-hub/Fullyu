/**
 * 集成测试脚手架：复制模板库 → 启动 Nest 应用 → 提供带鉴权的请求助手。
 * 模板库由 test/global-setup.ts 生成；每个 spec 文件使用独立副本，测试之间互不污染。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
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

/**
 * 用例的对接配置默认值。
 * Prisma 客户端在 import 阶段就把 apps/server/.env 读进 process.env，本机的打印/支付配置
 * 会顺着漏进用例（曾导致打印机是 live、打印队列用例全红）。所以由 harness 统一钉住
 * 「测试环境 = mock」，需要真实驱动的用例通过 options.env 显式覆盖。
 */
const TEST_INTEGRATIONS_ENV: Record<string, string> = {
  INTEGRATIONS_MODE: 'mock',
  INTEGRATIONS_PRINTER_MODE: 'mock'
};

export type HarnessOptions = {
  /** 覆盖测试环境变量，例如打印代理用例把 printer 切到 agent（live）。 */
  env?: Record<string, string>;
};

export type Harness = {
  app: INestApplication;
  prisma: PrismaService;
  dbFile: string;
  api: (method: HttpMethod, url: string, token?: string | null, body?: unknown) => request.Test;
  login: (username?: string, password?: string) => Promise<string>;
  customer: (name?: string) => Promise<{ token: string; id: string; memberCode: string; phone: string }>;
  close: () => Promise<void>;
};

let seq = 0;

/**
 * 模板描述：SQLite 模式下是「复制一份 .db」，MySQL 模式下是「从模板库复制出一个独立库」。
 * 两者由 test/global-setup.ts 写入的指针决定。
 */
type Template = { kind: 'sqlite'; file: string } | { kind: 'mysql'; url: string; dbName: string };

/** 读取 globalSetup 写入的模板指针（每次 jest 运行一份独立模板，互不覆盖）。 */
async function locateTemplate(): Promise<Template> {
  const root = path.join(os.tmpdir(), 'teahour-jest');
  const pointer = path.join(root, 'template.path');
  const started = Date.now();
  for (;;) {
    try {
      const fromPointer = fs.readFileSync(pointer, 'utf8').trim();
      if (fromPointer.startsWith('mysql:')) {
        const url = fromPointer.slice('mysql:'.length);
        return { kind: 'mysql', url, dbName: decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) };
      }
      if (fromPointer && fs.existsSync(fromPointer)) return { kind: 'sqlite', file: fromPointer };
    } catch {
      // 指针尚未落盘，继续等待
    }
    const legacy = path.join(root, 'template.db');
    if (fs.existsSync(legacy)) return { kind: 'sqlite', file: legacy };
    if (Date.now() - started > 10000) {
      throw new Error('测试模板库不存在，请通过 pnpm --filter @teahour/server test 运行（globalSetup 会生成）');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** 库里的全部表：现查 information_schema，新增表不用回来改清单。 */
async function listTables(db: PrismaClient, schema: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    'SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ? ORDER BY TABLE_NAME',
    schema
  );
  return rows.map((row) => row.name);
}

/**
 * MySQL 模式的隔离：照模板库复制出一个本 spec 独占的库。
 * 等价于 SQLite 复制 .db 文件；比「清表 + 重灌种子」快一个数量级（种子是几百次往返）。
 * CREATE TABLE LIKE 不复制外键，所以表之间不用排序，也不会因为外键顺序插入失败。
 */
async function cloneMysqlDatabase(template: { url: string; dbName: string }, cloneName: string): Promise<string> {
  const db = new PrismaClient({ datasourceUrl: template.url });
  try {
    const tables = await listTables(db, template.dbName);
    await db.$executeRawUnsafe(`CREATE DATABASE \`${cloneName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    for (const table of tables) {
      await db.$executeRawUnsafe(`CREATE TABLE \`${cloneName}\`.\`${table}\` LIKE \`${template.dbName}\`.\`${table}\``);
      await db.$executeRawUnsafe(
        `INSERT INTO \`${cloneName}\`.\`${table}\` SELECT * FROM \`${template.dbName}\`.\`${table}\``
      );
    }
  } finally {
    await db.$disconnect();
  }
  const url = new URL(template.url);
  url.pathname = `/${cloneName}`;
  return url.toString();
}

async function dropMysqlDatabase(url: string, dbName: string): Promise<void> {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${dbName}\``);
  } catch {
    // 清理失败不影响用例结果；留下的库名带进程号，下次一眼能认出是残留。
  } finally {
    await db.$disconnect();
  }
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const template = await locateTemplate();
  let dbFile = '';
  let mysqlClone: { url: string; dbName: string } | null = null;
  if (template.kind === 'sqlite') {
    dbFile = path.join(
      os.tmpdir(),
      'teahour-jest',
      `run-${process.pid}-${Date.now()}-${(seq += 1)}.db`
    );
    fs.copyFileSync(template.file, dbFile);
    process.env.DATABASE_URL = `file:${dbFile}`;
  } else {
    seq += 1;
    const cloneName = `${template.dbName}_run_${process.pid}_${seq}`;
    const url = await cloneMysqlDatabase(template, cloneName);
    mysqlClone = { url, dbName: cloneName };
    process.env.DATABASE_URL = url;
  }
  Object.assign(process.env, TEST_INTEGRATIONS_ENV, options.env);

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
    dbFile,
    api,
    login,
    customer,
    close: async () => {
      await app.close();
      if (mysqlClone) {
        // 应用连接已断开，再删这个 spec 独占的库。
        await dropMysqlDatabase(mysqlClone.url, mysqlClone.dbName);
        return;
      }
      // SQLite 模式：删掉复制出来的运行库。
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
