/**
 * 测试用 MySQL 小工具：建库 / 删库 / 导入 dump。
 *
 * 连接串取自 TEST_DATABASE_URL（默认 mysql://root@127.0.0.1:3306，即本机 socket 同主机端口）。
 * 只用 mysql / mysqldump 命令行，避免测试进程再背一个数据库驱动。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export type MysqlBase = {
  host: string;
  port: string;
  user: string;
  password: string;
};

export function mysqlBase(): MysqlBase {
  const raw = process.env.TEST_DATABASE_URL || 'mysql://root@127.0.0.1:3306';
  const url = new URL(raw);
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '3306',
    user: decodeURIComponent(url.username || 'root'),
    password: decodeURIComponent(url.password || '')
  };
}

const clientArgs = (base: MysqlBase): string[] => [
  '-h',
  base.host,
  '-P',
  base.port,
  '-u',
  base.user,
  ...(base.password ? [`-p${base.password}`] : [])
];

export function databaseUrl(base: MysqlBase, database: string): string {
  const auth = base.password
    ? `${encodeURIComponent(base.user)}:${encodeURIComponent(base.password)}`
    : encodeURIComponent(base.user);
  return `mysql://${auth}@${base.host}:${base.port}/${database}`;
}

export function createDatabase(base: MysqlBase, database: string): void {
  execFileSync(
    'mysql',
    [
      ...clientArgs(base),
      '-e',
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    ],
    { stdio: 'pipe' }
  );
}

export function dropDatabase(base: MysqlBase, database: string): void {
  execFileSync('mysql', [...clientArgs(base), '-e', `DROP DATABASE IF EXISTS \`${database}\``], {
    stdio: 'pipe'
  });
}

export function dumpDatabase(base: MysqlBase, database: string, file: string): void {
  const sql = execFileSync(
    'mysqldump',
    [
      ...clientArgs(base),
      '--single-transaction',
      '--skip-comments',
      '--no-tablespaces',
      '--default-character-set=utf8mb4',
      '--add-drop-table',
      database
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }
  );
  fs.writeFileSync(file, sql);
}

export function importDump(base: MysqlBase, database: string, file: string): void {
  execFileSync('mysql', [...clientArgs(base), '--default-character-set=utf8mb4', database], {
    input: fs.readFileSync(file),
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

/** 库名上限 64 字符，统一加前缀，方便在 MySQL 里一眼认出测试库。 */
export function testDatabaseName(kind: string, suffix: string): string {
  return `teahour_test_${kind}_${String(process.pid)}_${suffix}`.slice(0, 64);
}