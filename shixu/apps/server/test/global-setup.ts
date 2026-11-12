/**
 * Jest 全局准备：在测试 MySQL 里建一份模板库 → dump 成 .sql → 删库。
 * 每个 spec 在 beforeAll 时克隆成自己的库，互不污染；跑完自动 drop。
 *
 * 连接串取 TEST_DATABASE_URL（默认本机 root，无密码）：
 *   TEST_DATABASE_URL="mysql://user:pass@127.0.0.1:3306" pnpm --filter @teahour/server test
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDatabase,
  databaseUrl,
  dropDatabase,
  dumpDatabase,
  mysqlBase,
  testDatabaseName
} from '../src/testing/mysql-db';

const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function pruneOldRuns(root: string): void {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  const now = Date.now();
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    try {
      if (now - fs.statSync(full).mtimeMs > MAX_AGE_MS) fs.rmSync(full, { recursive: true, force: true });
    } catch {
      // 清理失败不影响本次运行
    }
  }
}

export default function globalSetup(): void {
  const serverRoot = path.resolve(__dirname, '..');
  const root = path.join(os.tmpdir(), 'teahour-jest');
  fs.mkdirSync(root, { recursive: true });
  pruneOldRuns(root);

  const base = mysqlBase();
  const template = testDatabaseName('tpl', String(Date.now()));
  const dumpFile = path.join(root, `template-${process.pid}-${Date.now()}.sql`);

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl(base, template),
    SEED_FORCE: '1',
    SEED_TRANSACTIONS: '0',
    SEED_PASSWORD: 'teahour2026'
  };
  const prismaCli = path.resolve(serverRoot, 'node_modules/prisma/build/index.js');
  const tsxCli = path.resolve(serverRoot, 'node_modules/tsx/dist/cli.mjs');

  try {
    createDatabase(base, template);
    execFileSync(
      process.execPath,
      [prismaCli, 'db', 'push', '--skip-generate', '--force-reset', '--accept-data-loss'],
      { cwd: serverRoot, env, stdio: 'pipe' }
    );
    execFileSync(process.execPath, [tsxCli, 'prisma/seed.ts'], {
      cwd: serverRoot,
      env,
      stdio: 'pipe'
    });
    dumpDatabase(base, template, dumpFile);
  } finally {
    dropDatabase(base, template);
  }

  // 指针文件最后写入，保证测试进程读到的模板已经是完整可用的。
  const pointer = path.join(root, 'template.path');
  const temp = `${pointer}.${process.pid}.tmp`;
  fs.writeFileSync(
    temp,
    JSON.stringify({
      host: base.host,
      port: base.port,
      user: base.user,
      password: base.password,
      dump: dumpFile
    })
  );
  fs.renameSync(temp, pointer);
}