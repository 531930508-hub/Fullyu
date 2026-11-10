/**
 * 茶单二级标题样例数据（幂等）。
 *
 * 用途：在不重建数据库的前提下，为现有门店补齐
 * - 分类：鲜酿茶 / 康普茶 / 气泡茶（分类名称即小程序茶单的二级标题）
 * - 康普茶三种口味样例商品与各门店库存
 * - 把气泡茶商品归到「气泡茶」分类
 *
 * 运行（服务器）：
 *   cd /opt/teahour/app/apps/server
 *   DATABASE_URL=file:/var/lib/teahour/teahour.db \
 *     /opt/teahour/runtime/bin/node /path/to/apply-menu-groups.cjs
 *
 * 可重复执行；只 upsert 指定分类/商品，不改动其它商品和订单。
 */
const path = require('node:path');
const { createRequire } = require('node:module');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/var/lib/teahour/teahour.db';

const serverDir = process.env.TEAHOUR_SERVER_DIR || '/opt/teahour/app/apps/server';
const serverRequire = createRequire(path.join(serverDir, 'package.json'));
const { PrismaClient } = serverRequire('@prisma/client');

const prisma = new PrismaClient();

const categories = [
  { id: 'fresh', name: '鲜酿茶', nameEn: 'Fresh fermented', kind: 'tea' },
  { id: 'kombucha', name: '康普茶', nameEn: 'Kombucha', kind: 'tea' },
  { id: 'sparkling', name: '气泡茶', nameEn: 'Sparkling tea', kind: 'tea' }
];

const products = [
  {
    id: 'xing-5',
    name: '醒·菠萝椰香',
    nameEn: 'GOOD DAY · Pineapple Coconut',
    series: 'xing',
    priceCents: 2400,
    costCents: 800,
    descZh: '菠萝的酸甜先到，椰香在后面慢慢铺开，康普的微气泡把整杯托得很轻。',
    descEn: 'Pineapple first, coconut softly after. A light kombucha with a gentle sparkle.',
    tagZh: '菠萝 · 椰香',
    tagEn: 'Pineapple · Coconut'
  },
  {
    id: 'xing-6',
    name: '醒·云南野香苏',
    nameEn: 'GOOD DAY · Wild Basil',
    series: 'xing',
    priceCents: 2400,
    costCents: 800,
    descZh: '野香苏的清凉草本香，带一点云南山野的气息。醒神，但不刺激。',
    descEn: 'Wild basil, cool and herbal, with a hint of Yunnan hills. Awake, never sharp.',
    tagZh: '野香苏 · 草本',
    tagEn: 'Wild basil · Herbal'
  },
  {
    id: 'xing-7',
    name: '醒·云南野山茶',
    nameEn: 'GOOD DAY · Wild Camellia',
    series: 'xing',
    priceCents: 2400,
    costCents: 800,
    descZh: '云南野山茶的清苦打底，康普的酸度收得干净，尾段留一点回甘。',
    descEn: 'Wild Yunnan camellia gives a clean base, kombucha adds a bright edge and a soft finish.',
    tagZh: '野山茶 · 回甘',
    tagEn: 'Wild camellia · Sweet finish'
  }
];

const SPARKLING_IDS = ['song-1', 'spark', 'smoke'];

async function main() {
  const now = new Date();

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, nameEn: category.nameEn, kind: category.kind },
      create: category
    });
  }

  await prisma.product.updateMany({
    where: { id: { in: SPARKLING_IDS } },
    data: { categoryId: 'sparkling' }
  });

  const stores = await prisma.store.findMany({ select: { id: true } });

  for (const item of products) {
    const data = {
      name: item.name,
      nameEn: item.nameEn,
      categoryId: 'kombucha',
      series: item.series,
      kind: 'tea',
      priceCents: item.priceCents,
      costCents: item.costCents,
      doseG: 3.5,
      status: 'published',
      tempsJson: JSON.stringify(['冰']),
      ice: false,
      memberEligible: true,
      descZh: item.descZh,
      descEn: item.descEn,
      specZh: '固定规格',
      specEn: 'Fixed serving',
      tagZh: item.tagZh,
      tagEn: item.tagEn,
      unitZh: '杯',
      unitEn: 'cup',
      updatedAt: now
    };
    await prisma.product.upsert({
      where: { id: item.id },
      update: data,
      create: { id: item.id, ...data }
    });

    for (const store of stores) {
      await prisma.stock.upsert({
        where: { storeId_productId: { storeId: store.id, productId: item.id } },
        update: { grams: 480, soldOut: false },
        create: { storeId: store.id, productId: item.id, grams: 480, soldOut: false }
      });
    }

    await prisma.mapping.upsert({
      where: { externalId: `SCM-${item.id}` },
      update: { productId: item.id, updatedAt: now },
      create: {
        id: `MAP-${item.id}`,
        externalId: `SCM-${item.id}`,
        productId: item.id,
        unit: '袋',
        factor: 500,
        updatedAt: now
      }
    });
  }

  const summary = {
    categories: await prisma.category.count(),
    kombuchaProducts: await prisma.product.count({ where: { categoryId: 'kombucha' } }),
    sparklingProducts: await prisma.product.count({ where: { categoryId: 'sparkling' } }),
    stores: stores.length
  };
  console.log(JSON.stringify(summary));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
