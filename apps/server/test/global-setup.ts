/**
 * Jest 全局准备：在系统临时目录重建一份干净的 SQLite 模板库。
 * 每个 spec 文件在 beforeAll 时复制模板，互不影响。
 *
 * 模板放在本次运行独有的目录里，并通过指针文件告知测试进程位置：
 * 同时跑多个 jest（本地并行验证、CI 重试）时不会互相删除对方的模板与数据库。
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

export default function globalSetup(): void {
  const serverRoot = path.resolve(__dirname, '..');
  const root = path.join(os.tmpdir(), 'teahour-jest');
  fs.mkdirSync(root, { recursive: true });
  pruneOldRuns(root);

  const runDir = path.join(root, `template-${process.pid}-${Date.now()}`);
  fs.mkdirSync(runDir, { recursive: true });
  const dbFile = path.join(runDir, 'template.db');
  const env = {
    ...process.env,
    DATABASE_URL: `file:${dbFile}`,
    SEED_FORCE: '1',
    SEED_TRANSACTIONS: '0',
    SEED_PASSWORD: 'teahour2026'
  };
  const prismaCli = path.resolve(serverRoot, 'node_modules/prisma/build/index.js');
  const tsxCli = path.resolve(serverRoot, 'node_modules/tsx/dist/cli.mjs');

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

  // 指针文件最后写入，保证测试进程读到的模板已经是完整可用的。
  const pointer = path.join(root, 'template.path');
  const temp = `${pointer}.${process.pid}.tmp`;
  fs.writeFileSync(temp, dbFile);
  fs.renameSync(temp, pointer);
}
