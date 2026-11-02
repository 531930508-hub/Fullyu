import { resolve } from 'node:path';
import { initDb } from './db/index.js';

const file = process.env.DATABASE_FILE || resolve(process.cwd(), 'data/teahour.db');
const db = initDb(file, { demoData: true, password: process.env.DEMO_PASSWORD || 'teahour2026' });
const counts = {
  stores: (db.prepare('SELECT COUNT(*) AS n FROM stores').get() as { n: number }).n,
  products: (db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n,
  staff: (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n,
  orders: (db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n
};
console.log(`时叙数据库已初始化：${file}`);
console.log(counts);
console.log('演示账号：13800000001–13800000006，密码 teahour2026');
db.close();
