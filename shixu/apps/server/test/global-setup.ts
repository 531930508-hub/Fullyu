/**
 * Jest 全局准备。
 *
 * 两种模式，由 TEST_DATABASE_URL 决定：
 * - 默认 SQLite：在系统临时目录重建一份干净的模板库，每个 spec 复制一份，互不影响。
 * - 设了 TEST_DATABASE_URL（mysql://…）：直接在这个库上 db push --force-reset 建结构并灌种子；
 *   库名必须含 `_test` 或 `rehearsal`，防止误伤生产库。MySQL 上没有「复制一份库」的等价手段，
 *   所以每个 spec 在 harness 里改为「清表 + 重灌种子」（jest maxWorkers=1，spec 之间串行）。
 *
 * 指针文件放在本次运行独有的目录里，并告知测试进程用的是哪种模式：
 * 同时跑多个 jest（本地并行验证、CI 重试）时不会互相覆盖对方的模板。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
      if (entry.isDirectory()) {
        if (now - fs.statSync(full).mtimeMs > MAX_AGE_MS) fs.rmSync(full, { recursive: true, force: true });
        continue;
      }
      // 各 spec 复制出来的运行库与指针临时文件，过期后一并清理。
      if (entry.name.startsWith('run-') && now - fs.statSync(full).mtimeMs > MAX_AGE_MS) {
        fs.rmSync(full, { force: true });
      }
    } catch {
      // 清理失败不影响本次运行
    }
  }
}

/** MySQL 库名兜底：只允许指向测试/演练库，避免 --force-reset 打到 teahour 生产库。 */
function assertSafeMysqlTarget(url: string): void {
  let dbName = '';
  try {
    dbName = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error(`TEST_DATABASE_URL 不是合法连接串：${url}`);
  }
  if (!/_test\b|_test$|rehearsal/.test(dbName)) {
    throw new Error(
      `TEST_DATABASE_URL 的库名必须含 _test 或 rehearsal（当前「${dbName}」）：测试会 force-reset 整库`
    );
  }
}

export default function globalSetup(): void {
  const serverRoot = path.resolve(__dirname, '..');
  const root = path.join(os.tmpdir(), 'teahour-jest');
  fs.mkdirSync(root, { recursive: true });
  pruneOldRuns(root);

  const prismaCli = path.resolve(serverRoot, 'node_modules/prisma/build/index.js');
  const tsxCli = path.resolve(serverRoot, 'node_modules/tsx/dist/cli.mjs');
  const pointer = path.join(root, 'template.path');
  const writePointer = (content: string) => {
    // 指针最后写入，保证测试进程读到的模板已经完整可用。
    const temp = `${pointer}.${process.pid}.tmp`;
    fs.writeFileSync(temp, content);
    fs.renameSync(temp, pointer);
  };

  const remoteUrl = (process.env.TEST_DATABASE_URL || '').trim();
  if (remoteUrl) {
    if (!/^mysql:\/\//.test(remoteUrl)) {
      throw new Error('TEST_DATABASE_URL 必须以 mysql:// 开头（SQLite 不需要设置这个变量）');
    }
    assertSafeMysqlTarget(remoteUrl);
    const env = {
      ...process.env,
      DATABASE_URL: remoteUrl,
      SEED_FORCE: '1',
      SEED_TRANSACTIONS: '0',
      SEED_PASSWORD: 'teahour2026'
    };
    execFileSync(
      process.execPath,
      [prismaCli, 'db', 'push', '--skip-generate', '--force-reset', '--accept-data-loss'],
      { cwd: serverRoot, env, stdio: 'pipe' }
    );
    execFileSync(process.execPath, [tsxCli, 'prisma/seed.ts'], { cwd: serverRoot, env, stdio: 'pipe' });
    writePointer(`mysql:${remoteUrl}`);
    return;
  }

  const runDir = path.join(root, `template-${process.pid}-${Date.now()}`);
  fs.mkdirSync(runDir, { recursive: true });
  const dbFile = path.join(runDir, 'template.db');
  // schema 已经切到 MySQL 时，SQLite 分支跑不了（Prisma 会报 P1012），提前给出人能看懂的提示。
  const schema = fs.readFileSync(path.join(serverRoot, 'prisma/schema.prisma'), 'utf8');
  if (/provider\s*=\s*"mysql"/.test(schema)) {
    throw new Error(
      'prisma 已切 MySQL：跑测试请设 TEST_DATABASE_URL=mysql://<user>:<pw>@<host>:<port>/<db_with_test_in_name>（本地无 MySQL 时先 ssh -L 到测试库）'
    );
  }
  const env = {
    ...process.env,
    DATABASE_URL: `file:${dbFile}`,
    SEED_FORCE: '1',
    SEED_TRANSACTIONS: '0',
    SEED_PASSWORD: 'teahour2026'
  };

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

  writePointer(dbFile);
}