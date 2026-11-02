import { resolve } from 'node:path';
import { initDb } from './db/index.js';
import { buildApp } from './app.js';

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const databaseFile = process.env.DATABASE_FILE || resolve(process.cwd(), 'data/teahour.db');
const demoData = process.env.DEMO_DATA !== '0';

const db = initDb(databaseFile, { demoData });
const app = await buildApp({ db, logger: true });

const close = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

await app.listen({ port, host });
app.log.info(
  `Full愈·时叙 API 已启动 · http://localhost:${port} · 数据库 ${databaseFile} · 硬件适配器全部为 mock`
);
