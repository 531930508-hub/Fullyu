/**
 * 时叙初始化数据种子：门店、分类、商品、库存、角色、账号、原料映射，以及可选的开账交易与运营费用。
 * 运行：pnpm --filter @teahour/server db:seed
 * 重置：SEED_FORCE=1 pnpm --filter @teahour/server db:seed
 *
 * 开关集中在校验过的 seed-config：
 * - 密码：优先 SEED_PASSWORD，否则随机生成并写入本地文件（绝不打印到日志）；
 * - 演示交易：仅 SEED_TRANSACTIONS=1 时写入，默认干净库；
 * - 清库：非生产环境需 SEED_FORCE=1，生产环境直接拒绝。
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ROLE_TEMPLATES, toDateString } from '@teahour/shared';
import { resolveSeedCredential, shouldSeedTransactions, wipeAllowed } from '../src/config/seed-config';
import { seedData } from './seed-data';

const prisma = new PrismaClient();

async function wipe() {
  await prisma.printJob.deleteMany();
  await prisma.paymentIntent.deleteMany();
  await prisma.refundIntent.deleteMany();
  await prisma.orderUnit.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.financeEntry.deleteMany();
  await prisma.order.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.loss.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.log.deleteMany();
  await prisma.mapping.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.userStore.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  // 门店放在最后删：上面所有表都带 storeId 外键，先清子表再清门店。
  await prisma.store.deleteMany();
}

async function seedOpeningTransactions() {
  const now = Date.now();
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  if (!stores.length) return;
  const sh = stores.find((store) => store.id === 'sh') || stores[0];
  const bj = stores.find((store) => store.id === 'bj') || stores[0];
  const products = await prisma.product.findMany();
  const productMap = new Map(products.map((product) => [product.id, product]));

  const openingOrders: Array<{
    storeId: string;
    number: string;
    channel: string;
    type: string;
    seat: string | null;
    items: Array<[string, number]>;
    status: string;
    minutesAgo: number;
  }> = [
    {
      storeId: sh.id,
      number: 'A101',
      channel: 'mini',
      type: 'dine',
      seat: '吧台06',
      items: [
        ['song-0', 1],
        ['xing-1', 1]
      ],
      status: 'pending',
      minutesAgo: 3
    },
    {
      storeId: sh.id,
      number: 'A102',
      channel: 'meituan',
      type: 'delivery',
      seat: null,
      items: [['qing-2', 2]],
      status: 'ready',
      minutesAgo: 12
    },
    {
      storeId: sh.id,
      number: 'A103',
      channel: 'mini',
      type: 'takeaway',
      seat: null,
      items: [['mian-4', 1]],
      status: 'pending',
      minutesAgo: 1
    },
    {
      storeId: bj.id,
      number: 'A104',
      channel: 'mini',
      type: 'dine',
      seat: '01桌',
      items: [['song-2', 1]],
      status: 'ready',
      minutesAgo: 25
    }
  ];

  for (const order of openingOrders) {
    const createdAt = new Date(now - order.minutesAgo * 60_000);
    const lines = order.items
      .map(([id, qty]) => ({ product: productMap.get(String(id)), qty: Number(qty) }))
      .filter((line): line is { product: NonNullable<typeof line.product>; qty: number } => Boolean(line.product));
    if (!lines.length) continue;
    const total = lines.reduce((n, line) => n + line.product.priceCents * line.qty, 0);
    const cost = lines.reduce((n, line) => n + line.product.costCents * line.qty, 0);
    const id = `SEED-${order.number}`;
    const ready = order.status === 'ready';
    await prisma.order.create({
      data: {
        id,
        number: order.number,
        business: 'fresh',
        storeId: order.storeId,
        channel: order.channel,
        type: order.type,
        seat: order.seat,
        status: order.status,
        paymentStatus: 'paid',
        totalCents: total,
        refundedCents: 0,
        pickupCode: null,
        pickupStoreId: null,
        printStatus: ready ? 'printed' : 'queued',
        parentOrderId: null,
        note: '',
        customerId: null,
        ownerKind: 'customer',
        createdBy: null,
        paymentRef: `TH-PAY-${order.number}`,
        paymentMethod: order.channel === 'meituan' ? '美团' : order.channel === 'taobao' ? '淘宝' : '微信支付',
        preparedAt: ready ? new Date(createdAt.getTime() + 240_000) : null,
        createdAt,
        paidAt: new Date(createdAt.getTime() + 30_000),
        deliveredAt: ready ? new Date(createdAt.getTime() + 250_000) : null,
        refundPending: false
      }
    });
    let cup = 0;
    let sortOrder = 0;
    for (const line of lines) {
      sortOrder += 1;
      const itemId = `SEED-${order.number}-${line.product.id}`;
      await prisma.orderItem.create({
        data: {
          id: itemId,
          orderId: id,
          productId: line.product.id,
          name: line.product.name,
          nameEn: line.product.nameEn,
          kind: line.product.kind,
          series: line.product.series,
          qty: line.qty,
          sortOrder,
          refundedQty: 0,
          unitPriceCents: line.product.priceCents,
          totalCents: line.product.priceCents * line.qty,
          costCents: line.product.costCents * line.qty,
          temp: '热',
          ice: line.product.kind === 'tea' ? '标准冰' : null
        }
      });
      for (let i = 0; i < line.qty; i += 1) {
        cup += 1;
        await prisma.orderUnit.create({
          data: {
            id: `SEED-${order.number}-U${cup}`,
            orderId: id,
            itemId,
            label: `${order.number}-${cup}`,
            status: ready ? 'scanned' : 'pending',
            scannedAt: ready ? new Date(createdAt.getTime() + 240_000) : null
          }
        });
      }
      if (line.product.kind === 'tea') {
        const stock = await prisma.stock.findUnique({
          where: { storeId_productId: { storeId: order.storeId, productId: line.product.id } }
        });
        if (stock) {
          await prisma.stock.update({
            where: { storeId_productId: { storeId: order.storeId, productId: line.product.id } },
            data: { grams: Math.max(0, stock.grams - line.product.doseG * line.qty) }
          });
        }
      }
    }
    const external = order.channel === 'meituan' || order.channel === 'taobao';
    await prisma.financeEntry.create({
      data: {
        id: `SEED-F-${order.number}`,
        orderId: id,
        storeId: order.storeId,
        type: 'SALE',
        amountCents: total,
        method: order.channel === 'mini' ? '微信支付' : order.channel === 'meituan' ? '美团结算' : '淘宝结算',
        settlement: external ? 'pending' : 'settled',
        memo: '订单收款',
        costCents: cost,
        dedupeKey: `ORDER:${id}:SALE`,
        at: new Date(createdAt.getTime() + 30_000)
      }
    });
    await prisma.counter.upsert({
      where: { name: 'order:A' },
      create: { name: 'order:A', value: 104 },
      update: { value: 104 }
    });
    await prisma.counter.upsert({
      where: { name: 'order:B' },
      create: { name: 'order:B', value: 104 },
      update: { value: 104 }
    });
  }

  const retailProduct = productMap.get('tea-bags');
  if (retailProduct) {
    const createdAt = new Date(now - 40 * 60_000);
    const id = 'SEED-R101';
    const stamp = toDateString(now).replace(/-/g, '');
    const number = `TH-R-${stamp}-0001`;
    await prisma.order.create({
      data: {
        id,
        number,
        business: 'retail',
        storeId: 'brand',
        channel: 'mini',
        type: 'retail',
        seat: null,
        status: 'awaiting',
        paymentStatus: 'paid',
        totalCents: retailProduct.priceCents,
        refundedCents: 0,
        pickupCode: '2468',
        pickupStoreId: sh.id,
        printStatus: 'none',
        parentOrderId: null,
        note: '零售自提订单',
        customerId: null,
        ownerKind: 'customer',
        createdBy: null,
        paymentRef: 'TH-PAY-R101',
        paymentMethod: '微信支付',
        preparedAt: null,
        createdAt,
        paidAt: new Date(createdAt.getTime() + 20_000),
        deliveredAt: null,
        refundPending: false
      }
    });
    await prisma.orderItem.create({
      data: {
        id: 'SEED-R101-item',
        orderId: id,
        productId: retailProduct.id,
        name: retailProduct.name,
        nameEn: retailProduct.nameEn,
        kind: 'retail',
        series: retailProduct.series,
        qty: 1,
        sortOrder: 1,
        refundedQty: 0,
        unitPriceCents: retailProduct.priceCents,
        totalCents: retailProduct.priceCents,
        costCents: retailProduct.costCents,
        temp: null,
        ice: null
      }
    });
    await prisma.financeEntry.create({
      data: {
        id: 'SEED-F-R101',
        orderId: id,
        storeId: 'brand',
        type: 'SALE',
        amountCents: retailProduct.priceCents,
        method: '微信支付',
        settlement: 'settled',
        memo: '零售收款',
        costCents: retailProduct.costCents,
        dedupeKey: `ORDER:${id}:SALE`,
        at: new Date(createdAt.getTime() + 20_000)
      }
    });
    await prisma.counter.upsert({
      where: { name: `retail:${stamp}` },
      create: { name: `retail:${stamp}`, value: 1 },
      update: { value: { increment: 0 } }
    });
  }

  const today = toDateString(now);
  const expenseTemplate: Array<[string, number, string]> = [
    ['labor', 6800, '当日人力'],
    ['rent', 4500, '租金日摊'],
    ['hq', 1200, '总部管理费分摊'],
    ['utilities', 800, '当日水电物业']
  ];
  let expenseSeq = 0;
  for (const store of stores) {
    for (const [category, amountCents, memo] of expenseTemplate) {
      expenseSeq += 1;
      await prisma.expense.create({
        data: {
          id: `SEED-EX-${expenseSeq}`,
          storeId: store.id,
          category,
          amountCents,
          at: today,
          memo,
          source: 'seed',
          batchId: 'seed-opening',
          createdBy: 'u-lin',
          createdAt: new Date(now)
        }
      });
    }
  }
  console.log(`开账交易：${openingOrders.length} 笔鲜酿订单 + 1 笔零售订单 + ${expenseSeq} 笔运营费用`);
}

async function main() {
  const credential = resolveSeedCredential();
  const password = credential.password;
  const force = wipeAllowed();
  const existing = await prisma.store.count();
  if (existing > 0 && !force) {
    console.log(`数据库已有 ${existing} 个门店，跳过种子。需要重置请执行 SEED_FORCE=1 pnpm --filter @teahour/server db:seed`);
    return;
  }
  if (force) {
    console.log('SEED_FORCE=1：清空现有数据…');
    await wipe();
  }

  const now = new Date();
  const hash = bcrypt.hashSync(password, 10);

  for (const store of seedData.stores) {
    await prisma.store.create({
      data: {
        id: store.id,
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
      }
    });
  }

  for (const category of seedData.categories) {
    await prisma.category.create({
      data: { id: category.id, name: category.name, nameEn: category.nameEn, kind: category.kind }
    });
  }

  // 茶单默认顺序：同系列同分类内按种子顺序编号（醒→松→庆→眠，鲜酿→康普茶→…）。
  const productOrder = new Map<string, number>();
  for (const product of seedData.products) {
    const groupKey = `${product.series}:${product.category}`;
    const sortOrder = (productOrder.get(groupKey) ?? 0) * 10;
    productOrder.set(groupKey, (productOrder.get(groupKey) ?? 0) + 1);
    await prisma.product.create({
      data: {
        id: product.id,
        name: product.name,
        nameEn: product.nameEn,
        categoryId: product.category,
        series: product.series,
        kind: product.kind,
        priceCents: product.price,
        costCents: product.cost,
        doseG: product.dose,
        status: product.status,
        tempsJson: JSON.stringify(product.temps),
        ice: product.ice,
        memberEligible: product.memberEligible,
        descZh: product.desc,
        descEn: product.descEn,
        specZh: product.spec,
        specEn: product.specEn,
        tagZh: product.tag,
        tagEn: product.tagEn,
        unitZh: product.unit,
        unitEn: product.unitEn,
        sortOrder,
        updatedAt: now
      }
    });
  }

  const stockByStore = seedData.stock as Record<string, Record<string, number>>;
  for (const store of seedData.stores) {
    const grams = stockByStore[store.id] || {};
    for (const product of seedData.products) {
      await prisma.stock.create({
        data: {
          storeId: store.id,
          productId: product.id,
          grams: grams[product.id] ?? 0,
          soldOut: false
        }
      });
    }
  }

  for (const role of ROLE_TEMPLATES) {
    await prisma.role.create({
      data: {
        id: role.id,
        name: role.name,
        description: role.description,
        scope: role.scope,
        builtin: role.builtin,
        permsJson: JSON.stringify(role.perms)
      }
    });
  }

  for (const user of seedData.staff) {
    await prisma.user.create({
      data: {
        id: user.id,
        name: user.name,
        username: user.username,
        passwordHash: hash,
        allStores: user.allStores,
        active: user.active,
        createdAt: now
      }
    });
    await prisma.userRole.createMany({
      data: user.roleIds.map((roleId: string) => ({ userId: user.id, roleId }))
    });
    if (user.storeIds.length) {
      await prisma.userStore.createMany({
        data: user.storeIds.map((storeId: string) => ({ userId: user.id, storeId }))
      });
    }
  }

  for (const product of seedData.products) {
    if (product.kind !== 'tea') continue;
    await prisma.mapping.create({
      data: {
        id: `MAP-${product.id}`,
        externalId: `SCM-${product.id}`,
        productId: product.id,
        unit: '袋',
        factor: 500,
        updatedAt: now
      }
    });
  }

  await prisma.setting.createMany({
    data: [
      {
        key: 'lossPolicy',
        valueJson: JSON.stringify({
          enabled: true,
          monthlyRatio: 3,
          approvalThresholdCents: 10000,
          approvers: ['u-zhou', 'u-lin']
        }),
        updatedAt: now
      },
      {
        key: 'refundFlow',
        valueJson: JSON.stringify({
          enabled: true,
          thresholdCents: 5000,
          approvers: ['u-zhou', 'u-lin']
        }),
        updatedAt: now
      }
    ]
  });

  if (shouldSeedTransactions()) {
    await seedOpeningTransactions();
  }

  const counts = {
    stores: await prisma.store.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    staff: await prisma.user.count(),
    orders: await prisma.order.count(),
    expenses: await prisma.expense.count()
  };
  console.log('时叙数据库已初始化');
  console.log(counts);
  if (credential.generated) {
    // 随机密码不进日志：落到本地文件，提示路径而非内容。
    const credentialFile = path.join(__dirname, '.seed-password.txt');
    fs.writeFileSync(credentialFile, `初始账号 13800000001–13800000006\n密码：${password}\n`, { mode: 0o600 });
    console.log(`初始账号：13800000001–13800000006，随机密码已写入 ${credentialFile}（请妥善保管后删除）`);
  } else {
    console.log('初始账号：13800000001–13800000006，密码来自 SEED_PASSWORD 环境变量');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
