/**
 * 每个 spec 跑前的超时口径。
 *
 * MySQL 模式下 harness 要把模板库整库复制一份（几十张表逐表 CREATE TABLE LIKE + INSERT SELECT），
 * 服务器忙或首次冷连时 beforeAll 偶尔超过默认 30s（testTimeout 同样作用于 hooks），
 * 报错信息只有 "Exceeded timeout of 30000 ms for a hook"，看起来像业务挂掉，实际是脚手架慢。
 * SQLite 复制 .db 近乎瞬时，保持 30s，慢用例仍然能快速暴露。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MYSQL_HOOK_TIMEOUT_MS = 120_000;

try {
  const pointer = fs.readFileSync(path.join(os.tmpdir(), 'teahour-jest', 'template.path'), 'utf8').trim();
  if (pointer.startsWith('mysql:')) jest.setTimeout(MYSQL_HOOK_TIMEOUT_MS);
} catch {
  // 指针还没落盘（或不在 jest 环境）：维持默认超时
}