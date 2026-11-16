#!/usr/bin/env node
/**
 * CRM 数据搬家：SQLite → MySQL(RDS)。
 * 用法：SRC=/path/crm.db DST=mysql://... node scripts/copy-sqlite-to-mysql.cjs [--dry]
 * 依赖：@prisma/client（SQLite 生成，工作区自带）+ .prisma-mysql（用 schema.mysql.prisma 生成）
 * 顺序：按 relationFromFields 拓扑排序，父表先写，避免外键失败。
 */
const path = require('path');
const SqliteModule = require('@prisma/client');
const MysqlModule = require(path.resolve(__dirname, '..', '.prisma-mysql'));

const SRC = process.env.SRC;
const DST = process.env.DST;
if (!SRC || !DST) { console.error('需要 SRC 和 DST'); process.exit(1); }
const DRY = process.argv.includes('--dry');
const CHUNK = 200;

const models = SqliteModule.Prisma.dmmf.datamodel.models;

// 父表 → 子表 拓扑排序
function topoSort() {
  const parents = new Map(models.map((m) => [m.name, new Set()]));
  for (const m of models) {
    for (const f of m.fields) {
      if (f.kind === 'object' && f.relationFromFields && f.relationFromFields.length && f.type !== m.name) {
        parents.get(m.name).add(f.type);
      }
    }
  }
  const out = [];
  const done = new Set();
  const visit = (name, stack) => {
    if (done.has(name)) return;
    if (stack.has(name)) throw new Error('关系有环：' + [...stack, name].join(' → '));
    stack.add(name);
    for (const p of parents.get(name)) visit(p, stack);
    stack.delete(name);
    done.add(name);
    out.push(name);
  };
  for (const m of models) visit(m.name, new Set());
  return out;
}

const delegate = (client, model) => client[model[0].toLowerCase() + model.slice(1)];

(async () => {
  const sqlite = new SqliteModule.PrismaClient({ datasources: { db: { url: 'file:' + SRC } } });
  const mysql = new MysqlModule.PrismaClient({ datasources: { db: { url: DST } } });
  const order = topoSort();
  console.log('写入顺序：', order.join(' → '));

  let failed = false;
  for (const model of order) {
    const rows = await delegate(sqlite, model).findMany();
    const target = delegate(mysql, model);
    if (!DRY && rows.length) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await target.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
      }
    }
    const got = DRY ? rows.length : await target.count();
    const ok = got === rows.length;
    if (!ok) failed = true;
    console.log(`${ok ? 'OK ' : 'BAD'} ${model.padEnd(24)} sqlite=${rows.length} mysql=${got}`);
  }
  await sqlite.$disconnect();
  await mysql.$disconnect();
  process.exit(failed ? 2 : 0);
})().catch(async (e) => { console.error('失败：', e.message); process.exit(1); });
