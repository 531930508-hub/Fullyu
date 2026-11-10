/**
 * 门店上线资料：上海·西岸店（真实地址）+ 北京·东直门店（12 月底开业，暂不可下单）。
 *
 * 幂等：按门店 id upsert；已有门店只更新门店资料，不动库存数量、订单、财务。
 * 仅用于把已确认的上线门店资料应用到已有数据库（种子只在新库执行一次，旧库不会自动更新）。
 *
 * 运行（服务器）：
 *   cd /opt/teahour/app/apps/server
 *   NODE_ENV=staging TEAHOUR_ALLOW_STORE_DATA=1 \
 *     /opt/teahour/runtime/bin/node /opt/teahour/app/deploy/apply-store-launch-data.cjs
 */
const path = require('node:path');
const { createRequire } = require('node:module');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/var/lib/teahour/teahour.db';

if (process.env.NODE_ENV === 'production' && process.env.TEAHOUR_ALLOW_STORE_DATA !== '1') {
  console.error('拒绝执行：NODE_ENV=production。确需更新门店资料请显式设置 TEAHOUR_ALLOW_STORE_DATA=1。');
  process.exit(2);
}

const serverDir = process.env.TEAHOUR_SERVER_DIR || '/opt/teahour/app/apps/server';
const serverRequire = createRequire(path.join(serverDir, 'package.json'));
const { PrismaClient } = serverRequire('@prisma/client');

const prisma = new PrismaClient();

const POSITIONS_STANDARD = [
  '吧台01', '吧台02', '吧台03', '吧台04', '吧台05', '吧台06', '吧台07', '吧台08',
  '窗边01', '窗边02', '窗边03', '窗边04'
];
const POSITIONS_BJ = ['01桌', '02桌', '03桌', '04桌', '吧台01', '吧台02'];

const STORES = [
  {
    id: 'sh',
    city: '上海',
    cityEn: 'Shanghai',
    name: '上海·西岸店',
    nameEn: 'Shanghai · West Bund',
    short: '西岸店',
    address: '上海市 · 徐汇区龙华机场路 8 号商业街区 1F',
    addressEn: 'Shanghai · 8 Longhua Airport Rd, Xuhui',
    lat: 31.176,
    lng: 121.459,
    open: true,
    retailPickup: true,
    hours: '10:00–21:00',
    printerStatus: 'online',
    channels: { mini: true, assisted: true, meituan: true, taobao: true },
    positions: POSITIONS_STANDARD,
    wait: 8
  },
  {
    id: 'sh-west',
    city: '上海',
    cityEn: 'Shanghai',
    name: '上海·西岸店（旧占位）',
    nameEn: 'Shanghai · West Bund (legacy)',
    short: '西岸旧店',
    address: '上海市 · 徐汇区龙腾大道 2600 号 B1',
    addressEn: 'Shanghai · 2600 Longteng Ave, Xuhui',
    lat: 31.18,
    lng: 121.46,
    open: false,
    retailPickup: false,
    hours: '暂未营业',
    printerStatus: 'online',
    channels: { mini: false, assisted: true, meituan: false, taobao: false },
    positions: POSITIONS_STANDARD,
    wait: 8
  },
  {
    id: 'bj',
    city: '北京',
    cityEn: 'Beijing',
    name: '北京·城市中心店（旧占位）',
    nameEn: 'Beijing · Central (legacy)',
    short: '城市中心旧店',
    address: '北京市 · 朝阳区建国路 87 号 1F',
    addressEn: 'Beijing · 87 Jianguo Rd, Chaoyang',
    lat: 39.92,
    lng: 116.42,
    open: false,
    retailPickup: false,
    hours: '暂未营业',
    printerStatus: 'online',
    channels: { mini: false, assisted: true, meituan: false, taobao: false },
    positions: POSITIONS_BJ,
    wait: 8
  },
  {
    id: 'bj-east',
    city: '北京',
    cityEn: 'Beijing',
    name: '北京·东直门店',
    nameEn: 'Beijing · Dongzhimen',
    short: '东直门店',
    address: '北京市 · 东城区东直门外大街 39 号',
    addressEn: 'Beijing · 39 Dongzhimenwai St, Dongcheng',
    lat: 39.942,
    lng: 116.444,
    // 12 月底开业：对外可见（小程序显示“敬请期待”），但不可下单。
    open: false,
    retailPickup: true,
    hours: '12 月底开业',
    printerStatus: 'online',
    channels: { mini: true, assisted: true, meituan: false, taobao: false },
    positions: POSITIONS_BJ,
    wait: 8
  }
];

async function ensureStock(storeId) {
  const products = await prisma.product.findMany({ select: { id: true } });
  const rows = await prisma.stock.findMany({ where: { storeId }, select: { productId: true } });
  const have = new Set(rows.map((row) => row.productId));
  let created = 0;
  for (const product of products) {
    if (have.has(product.id)) continue;
    await prisma.stock.create({ data: { storeId, productId: product.id, grams: 0 } });
    created += 1;
  }
  return created;
}

async function main() {
  for (const store of STORES) {
    const data = {
      city: store.city,
      cityEn: store.cityEn,
      name: store.name,
      nameEn: store.nameEn,
      short: store.short,
      address: store.address,
      addressEn: store.addressEn,
      lat: store.lat,
      lng: store.lng,
      open: store.open,
      retailPickup: store.retailPickup,
      hours: store.hours,
      printerStatus: store.printerStatus,
      channelsJson: JSON.stringify(store.channels),
      positionsJson: JSON.stringify(store.positions),
      waitMinutes: store.wait
    };
    const existing = await prisma.store.findUnique({ where: { id: store.id } });
    if (existing) {
      await prisma.store.update({ where: { id: store.id }, data });
      console.log(`更新 ${store.id} → ${store.name}（${store.open ? '营业' : '未营业'}）`);
    } else {
      await prisma.store.create({ data: { id: store.id, ...data } });
      console.log(`新增 ${store.id} → ${store.name}（${store.open ? '营业' : '未营业'}）`);
    }
    const stockCreated = await ensureStock(store.id);
    if (stockCreated) console.log(`  补齐 ${stockCreated} 条库存记录（数量 0，需在后台补货）`);
  }
  console.log('');
  console.log('完成。门店资料已按上线数据对齐；库存、订单与财务数据未改动。');
}

main()
  .catch((error) => {
    console.error('执行失败：', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
