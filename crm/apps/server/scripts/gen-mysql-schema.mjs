#!/usr/bin/env node
/**
 * 由 schema.prisma（SQLite，开发/测试）生成 schema.mysql.prisma（生产 MySQL）。
 * 规则：
 *   1. provider 换成 mysql
 *   2. 字段名以 Json / Reason / Note / Detail / Description 结尾的 String 一律加 @db.VarChar(2000)
 *      —— SQLite 不校验长度，MySQL 下 Prisma 默认 String 是 VARCHAR(191)，长 JSON 会被截断/报错
 * 生成文件是产物，不要手改；改规则改这里。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'prisma', 'schema.prisma');
const out = path.join(here, '..', 'prisma', 'schema.mysql.prisma');

const LONG = /(json|reason|note|detail|description)$/i;
const lines = fs.readFileSync(src, 'utf8').split('\n');
let model = null;
let hits = 0;

const body = lines.map((line) => {
  const m = line.match(/^model (\w+)/);
  if (m) model = m[1];
  if (/^\s*provider\s*=\s*"sqlite"/.test(line)) return line.replace('"sqlite"', '"mysql"');
  if (!model) return line;

  const f = line.match(/^(\s+)(\w+)(\s+)String(\?)?(\s+.*)?$/);
  if (!f) return line;
  const [, indent, name, gap, nullable = '', rest = ''] = f;
  if (LONG.test(name) && !/@db\./.test(rest)) {
    hits += 1;
    return `${indent}${name}${gap}String${nullable} @db.VarChar(2000)${rest}`;
  }
  return line;
});

const header = '// 自动生成，请勿手改。来源：schema.prisma + scripts/gen-mysql-schema.mjs\n';
const next = header + body.join('\n');

if (process.argv.includes('--check')) {
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (prev !== next) {
    console.error('schema.mysql.prisma 与 schema.prisma 不同步，请运行 pnpm schema:mysql');
    process.exit(1);
  }
  console.log('schema.mysql.prisma 已同步');
  process.exit(0);
}

fs.writeFileSync(out, next);
console.log(`schema.mysql.prisma 已生成：加长字段 ${hits} 个`);
