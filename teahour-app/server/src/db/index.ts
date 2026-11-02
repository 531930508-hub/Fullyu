import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { seedData } from '../seed-data.js';
import { SCHEMA_SQL } from './schema.js';
import { ROLE_TEMPLATES } from '../lib/permissions.js';
import { newId } from '../lib/ids.js';
import { toDateString } from '../lib/dates.js';

export type DbOptions = {
  demoData?: boolean;
  password?: string;
};

export function initDb(filename: string, options: DbOptions = {}): DatabaseType {
  if (filename !== ':memory:') {
    const absolute = resolve(filename);
    mkdirSync(dirname(absolute), { recursive: true });
    filename = absolute;
  }
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  if (filename !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  if (!(db.prepare('SELECT COUNT(*) AS n FROM stores').get() as { n: number }).n) {
    seedDatabase(db, options);
  }
  return db;
}

function seedDatabase(db: DatabaseType, options: DbOptions = {}): void {
  const now = Date.now();
  const password = options.password || process.env.DEMO_PASSWORD || 'teahour2026';
  const hash = bcrypt.hashSync(password, 10);

  const insertStore = db.prepare(
    `INSERT INTO stores (id, city, city_en, name, name_en, short, address, address_en, lat, lng, open, retail_pickup, hours, printer_status, channels_json, positions_json, wait_minutes)
     VALUES (@id,@city,@cityEn,@name,@nameEn,@short,@address,@addressEn,@lat,@lng,@open,@retailPickup,@hours,@printerStatus,@channels,@positions,@wait)`
  );
  const insertCategory = db.prepare(
    'INSERT INTO categories (id, name, name_en, kind) VALUES (@id,@name,@nameEn,@kind)'
  );
  const insertProduct = db.prepare(
    `INSERT INTO products (id, name, name_en, category_id, series, kind, price_cents, cost_cents, dose_g, status, temps_json, ice, member_eligible, desc_zh, desc_en, spec_zh, spec_en, tag_zh, tag_en, unit_zh, unit_en, updated_at)
     VALUES (@id,@name,@nameEn,@category,@series,@kind,@price,@cost,@dose,@status,@temps,@ice,@memberEligible,@desc,@descEn,@spec,@specEn,@tag,@tagEn,@unit,@unitEn,@updatedAt)`
  );
  const insertStock = db.prepare(
    'INSERT INTO stock (store_id, product_id, grams, sold_out) VALUES (?,?,?,0)'
  );
  const insertRole = db.prepare(
    'INSERT INTO roles (id, name, description, scope, builtin, perms_json) VALUES (?,?,?,?,?,?)'
  );
  const insertUser = db.prepare(
    'INSERT INTO users (id, name, username, password_hash, all_stores, active, created_at) VALUES (?,?,?,?,?,?,?)'
  );
  const insertUserRole = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)');
  const insertUserStore = db.prepare('INSERT INTO user_stores (user_id, store_id) VALUES (?,?)');

  const tx = db.transaction(() => {
    for (const store of seedData.stores) {
      insertStore.run({
        ...store,
        open: store.open ? 1 : 0,
        retailPickup: store.retailPickup ? 1 : 0,
        channels: JSON.stringify(store.channels),
        positions: JSON.stringify(store.positions),
        wait: store.wait
      });
    }
    for (const category of seedData.categories) {
      insertCategory.run(category);
    }
    for (const product of seedData.products) {
      insertProduct.run({
        ...product,
        temps: JSON.stringify(product.temps),
        ice: product.ice ? 1 : 0,
        memberEligible: product.memberEligible ? 1 : 0,
        updatedAt: now
      });
    }
    for (const [storeId, stock] of Object.entries(seedData.stock)) {
      for (const [productId, grams] of Object.entries(stock)) {
        insertStock.run(storeId, productId, grams);
      }
    }
    for (const role of ROLE_TEMPLATES) {
      insertRole.run(role.id, role.name, role.description, role.scope, role.builtin ? 1 : 0, JSON.stringify(role.perms));
    }
    for (const user of seedData.staff) {
      insertUser.run(user.id, user.name, user.username, hash, user.allStores ? 1 : 0, user.active ? 1 : 0, now);
      for (const roleId of user.roleIds) insertUserRole.run(user.id, roleId);
      for (const storeId of user.storeIds) insertUserStore.run(user.id, storeId);
    }

    const insertMapping = db.prepare(
      'INSERT INTO mappings (id, external_id, product_id, unit, factor, updated_at) VALUES (?,?,?,?,?,?)'
    );
    for (const product of seedData.products) {
      if (product.kind !== 'tea') continue;
      insertMapping.run(newId('MAP'), `SCM-${product.id}`, product.id, '袋', 500, now);
    }

    const insertSetting = db.prepare(
      'INSERT INTO settings (key, value_json, updated_at) VALUES (?,?,?)'
    );
    insertSetting.run(
      'lossPolicy',
      JSON.stringify({
        enabled: true,
        monthlyRatio: 3,
        approvalThresholdCents: 10000,
        approvers: ['u-zhou', 'u-lin']
      }),
      now
    );
    insertSetting.run(
      'refundFlow',
      JSON.stringify({
        enabled: true,
        thresholdCents: 5000,
        approvers: ['u-zhou', 'u-lin']
      }),
      now
    );
  });
  tx();

  if (options.demoData) seedDemoTransactions(db);
}

function seedDemoTransactions(db: DatabaseType): void {
  const now = Date.now();
  const stores = db.prepare('SELECT id, name FROM stores').all() as Array<{ id: string; name: string }>;
  if (!stores.length) return;
  const sh = stores.find((s) => s.id === 'sh') || stores[0];
  const bj = stores.find((s) => s.id === 'bj') || stores[0];
  const product = (id: string) =>
    db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
      | { id: string; name: string; name_en: string; kind: string; series: string; price_cents: number; cost_cents: number }
      | undefined;

  const insertOrder = db.prepare(
    `INSERT INTO orders (id, number, business, store_id, channel, type, seat, status, payment_status, total_cents, refunded_cents, pickup_code, pickup_store_id, print_status, parent_order_id, note, customer_id, owner_kind, created_by, payment_ref, payment_method, prepared_at, created_at, paid_at, delivered_at, refund_pending)
     VALUES (@id,@number,@business,@storeId,@channel,@type,@seat,@status,@paymentStatus,@totalCents,0,@pickupCode,@pickupStoreId,@printStatus,NULL,@note,@customerId,@ownerKind,NULL,@paymentRef,@paymentMethod,@preparedAt,@createdAt,@paidAt,@deliveredAt,0)`
  );
  const insertItem = db.prepare(
    `INSERT INTO order_items (id, order_id, product_id, name, name_en, kind, series, qty, refunded_qty, unit_price_cents, total_cents, cost_cents, temp, ice)
     VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?)`
  );
  const insertUnit = db.prepare(
    'INSERT INTO order_units (id, order_id, item_id, label, status, scanned_at) VALUES (?,?,?,?,?,?)'
  );
  const insertFinance = db.prepare(
    `INSERT INTO finance_entries (id, order_id, store_id, type, amount_cents, method, settlement, memo, cost_cents, dedupe_key, at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  const upsertCounter = db.prepare(
    'INSERT INTO counters (name, value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)'
  );

  const orders = [
    { store: sh, number: 'A101', channel: 'mini', type: 'dine', seat: '吧台06', items: [['song-0', 1], ['xing-1', 1]], status: 'pending', minutesAgo: 3 },
    { store: sh, number: 'A102', channel: 'meituan', type: 'delivery', seat: null, items: [['qing-2', 2]], status: 'ready', minutesAgo: 12 },
    { store: sh, number: 'A103', channel: 'mini', type: 'takeaway', seat: null, items: [['mian-4', 1]], status: 'pending', minutesAgo: 1 },
    { store: bj, number: 'A104', channel: 'mini', type: 'dine', seat: '01桌', items: [['song-2', 1]], status: 'ready', minutesAgo: 25 }
  ];
  const tx = db.transaction(() => {
    let seq = 100;
    for (const entry of orders) {
      seq += 1;
      const createdAt = now - entry.minutesAgo * 60_000;
      const items = entry.items
        .map(([id, qty]) => ({ product: product(String(id)), qty: Number(qty) }))
        .filter((x) => x.product);
      const total = items.reduce((n, x) => n + (x.product!.price_cents * x.qty), 0);
      const cost = items.reduce((n, x) => n + (x.product!.cost_cents * x.qty), 0);
      for (const item of items) {
        const productRow = db.prepare('SELECT dose_g, kind FROM products WHERE id = ?').get(item.product!.id) as
          | { dose_g: number; kind: string }
          | undefined;
        const used = productRow?.kind === 'tea' ? productRow.dose_g * item.qty : item.qty;
        db.prepare(
          'UPDATE stock SET grams = MAX(0, grams - ?) WHERE store_id = ? AND product_id = ?'
        ).run(used, entry.store.id, item.product!.id);
      }
      const id = `SEED-${entry.number}`;
      insertOrder.run({
        id,
        number: entry.number,
        business: 'fresh',
        storeId: entry.store.id,
        channel: entry.channel,
        type: entry.type,
        seat: entry.seat,
        status: entry.status,
        paymentStatus: 'paid',
        totalCents: total,
        pickupCode: null,
        pickupStoreId: null,
        printStatus: entry.status === 'ready' ? 'printed' : 'queued',
        note: '',
        customerId: null,
        ownerKind: 'customer',
        paymentRef: `SIM-${entry.number}`,
        paymentMethod: entry.channel === 'meituan' ? '美团' : entry.channel === 'taobao' ? '淘宝' : '微信支付',
        preparedAt: entry.status === 'ready' ? createdAt + 240_000 : null,
        createdAt,
        paidAt: createdAt + 30_000,
        deliveredAt: entry.status === 'ready' ? createdAt + 250_000 : null
      });
      let cup = 0;
      for (const item of items) {
        const itemId = `SEED-${entry.number}-${item.product!.id}`;        insertItem.run(
          itemId,
          id,
          item.product!.id,
          item.product!.name,
          item.product!.name_en,
          item.product!.kind,
          item.product!.series,
          item.qty,
          item.product!.price_cents,
          item.product!.price_cents * item.qty,
          item.product!.cost_cents * item.qty,
          '热',
          item.product!.kind === 'tea' ? '标准冰' : null
        );
        for (let i = 0; i < item.qty; i += 1) {
          cup += 1;
          insertUnit.run(
            newId('U'),
            id,
            itemId,
            `${entry.number}-${cup}`,
            entry.status === 'ready' ? 'scanned' : 'pending',
            entry.status === 'ready' ? createdAt + 240_000 : null
          );
        }
      }
      const external = entry.channel === 'meituan' || entry.channel === 'taobao';
      insertFinance.run(
        newId('F'),
        id,
        entry.store.id,
        'SALE',
        total,
        entry.channel === 'mini' ? '微信支付' : entry.channel === 'meituan' ? '美团结算' : '模拟收款',
        external ? 'pending' : 'settled',
        '示例订单收款',
        cost,
        `ORDER:${id}:SALE`,
        createdAt + 30_000
      );
      upsertCounter.run(`fresh:${toDateString(createdAt)}`, 100 + seq);
    }

    const retailProduct = product('tea-bags');
    if (retailProduct) {
      const createdAt = now - 40 * 60_000;
      const id = 'SEED-R101';
      const code = '2468';
      insertOrder.run({
        id,
        number: 'TH-R-20261029-0001',
        business: 'retail',
        storeId: 'brand',
        channel: 'mini',
        type: 'retail',
        seat: null,
        status: 'awaiting',
        paymentStatus: 'paid',
        totalCents: retailProduct.price_cents,
        pickupCode: code,
        pickupStoreId: sh.id,
        printStatus: 'printed',
        note: '示例零售订单',
        customerId: null,
        ownerKind: 'customer',
        paymentRef: 'SIM-R101',
        paymentMethod: '微信支付',
        preparedAt: null,
        createdAt,
        paidAt: createdAt + 20_000,
        deliveredAt: null
      });
      const itemId = 'SEED-R101-item';
      insertItem.run(itemId, id, retailProduct.id, retailProduct.name, retailProduct.name_en, 'retail', 'song', 1, retailProduct.price_cents, retailProduct.price_cents, retailProduct.cost_cents, null, null);
      insertFinance.run(newId('F'), id, 'brand', 'SALE', retailProduct.price_cents, '微信支付', 'settled', '示例零售收款', retailProduct.cost_cents, `ORDER:${id}:SALE`, createdAt + 20_000);
    }

    const expenseRows = stores.flatMap((store) => [
      ['labor', 6800, '演示：当日人力'],
      ['rent', 4500, '演示：租金日摊'],
      ['hq', 1200, '演示：总部管理费分摊'],
      ['utilities', 800, '演示：当日水电物业']
    ] as Array<[string, number, string]>);
    const insertExpense = db.prepare(
      `INSERT INTO expenses (id, store_id, category, amount_cents, at, memo, source, batch_id, created_by, created_at, voided_at, voided_by)
       VALUES (?,?,?,?,?,?, 'seed', 'seed-demo', 'u-lin', ?, NULL, NULL)`
    );
    const today = toDateString(now);
    for (const store of stores) {
      for (const [category, amount, memo] of expenseRows.splice(0, 4)) {
        insertExpense.run(newId('EX'), store.id, category, amount, today, memo, now);
      }
    }
  });
  tx();
}

export function logAction(
  db: DatabaseType,
  entry: {
    actorId?: string | null;
    actorName?: string | null;
    action: string;
    detail?: string;
    type?: string;
    storeId?: string | null;
    orderId?: string | null;
    at?: number;
  }
): void {
  db.prepare(
    `INSERT INTO logs (id, actor_id, actor_name, action, detail, type, store_id, order_id, at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    newId('LOG'),
    entry.actorId || null,
    entry.actorName || null,
    entry.action,
    entry.detail || '',
    entry.type || '',
    entry.storeId || null,
    entry.orderId || null,
    entry.at || Date.now()
  );
}

export type { DatabaseType };
