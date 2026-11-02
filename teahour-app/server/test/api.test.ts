import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import { initDb } from '../src/db/index.js';
import { buildApp } from '../src/app.js';
import { toDateString } from '../src/lib/dates.js';

const PASSWORD = 'teahour2026';

type Harness = {
  db: DatabaseType;
  app: FastifyInstance;
  login: (username: string) => Promise<string>;
  call: (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    token?: string | null,
    payload?: unknown
  ) => Promise<{ statusCode: number; json: () => any; body: string }>;
  close: () => Promise<void>;
};

async function harness(): Promise<Harness> {
  const db = initDb(':memory:', { demoData: true, password: PASSWORD });
  const app = await buildApp({ db, jwtSecret: 'test-secret' });

  const login = async (username: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password: PASSWORD }
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().token as string;
  };

  const call: Harness['call'] = (method, url, token, payload) =>
    app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as never
    });

  return {
    db,
    app,
    login,
    call,
    close: async () => {
      await app.close();
      db.close();
    }
  };
}

async function customerToken(h: Harness, name = 'QA 茶客') {
  const res = await h.call('POST', '/api/customer/session', null, { name });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  return { token: body.token as string, customer: body.customer as { id: string; memberCode: string } };
}

function freshOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    storeId: 'sh',
    business: 'fresh',
    type: 'dine',
    seat: '吧台01',
    items: [{ productId: 'xing-0', qty: 1, temp: '热', ice: null }],
    ...overrides
  };
}

test('健康检查与顾客启动数据可用', async () => {
  const h = await harness();
  try {
    const health = await h.call('GET', '/api/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().hardware, 'mock');

    const boot = await h.call('GET', '/api/customer/bootstrap');
    assert.equal(boot.statusCode, 200);
    const data = boot.json();
    assert.ok(data.stores.length >= 4);
    assert.ok(data.products.length >= 20);
    assert.equal(data.store.id, data.stores[0].id);
    assert.equal(data.hardware.payment, 'mock');
  } finally {
    await h.close();
  }
});

test('会员码按杯立减并生成杯贴', async () => {
  const h = await harness();
  try {
    const verify = await h.call('POST', '/api/customer/member/verify', null, { code: 'TH-DEMO-0001' });
    assert.equal(verify.statusCode, 200);
    assert.equal(verify.json().benefit.tier, 'annual');
    assert.equal(verify.json().benefit.discountPerCupCents, 100);

    const { token, customer } = await customerToken(h);
    assert.match(customer.memberCode, /^TH-/);
    const res = await h.call(
      'POST',
      '/api/customer/orders',
      token,
      freshOrderBody({ items: [{ productId: 'xing-0', qty: 3, temp: '热' }], memberCode: 'TH-DEMO-0001' })
    );
    assert.equal(res.statusCode, 200, res.body);
    const order = res.json().order;
    assert.equal(order.totalCents, 3 * 2000 - 3 * 100);
    assert.equal(order.units.length, 3);
    assert.equal(order.paymentStatus, 'paid');
    assert.equal(order.printStatus, 'printed');
    assert.match(order.number, /^A\d{3}$/);
    assert.ok(order.units.every((unit: { label: string }) => unit.label.startsWith(order.number)));
  } finally {
    await h.close();
  }
});

test('扫码逐杯出餐，全部扫码后订单待取餐', async () => {
  const h = await harness();
  try {
    const { token } = await customerToken(h);
    const created = await h.call(
      'POST',
      '/api/customer/orders',
      token,
      freshOrderBody({ items: [{ productId: 'xing-0', qty: 2, temp: '冰' }], type: 'takeaway' })
    );
    assert.equal(created.statusCode, 200, created.body);
    const order = created.json().order;

    const manager = await h.login('13800000004');
    let latest = order;
    for (const unit of order.units) {
      const scan = await h.call('POST', '/api/store/scan', manager, { code: unit.label });
      assert.equal(scan.statusCode, 200, scan.body);
      latest = scan.json().order;
    }
    assert.equal(latest.cupScanned, 2);
    assert.equal(latest.status, 'ready');
  } finally {
    await h.close();
  }
});

test('零售订单生成 4 位提货码并可核销交付', async () => {
  const h = await harness();
  try {
    const { token } = await customerToken(h);
    const res = await h.call('POST', '/api/customer/orders', token, {
      storeId: 'sh',
      business: 'retail',
      type: 'retail',
      items: [{ productId: 'retail-0', qty: 1 }]
    });
    assert.equal(res.statusCode, 200, res.body);
    const order = res.json().order;
    assert.equal(order.business, 'retail');
    assert.match(order.number, /^TH-R-\d{8}-\d{4}$/);
    assert.match(order.pickupCode, /^\d{4}$/);

    const manager = await h.login('13800000004');
    const lookup = await h.call('POST', '/api/store/retail/lookup', manager, { code: order.pickupCode });
    assert.equal(lookup.statusCode, 200, lookup.body);
    assert.equal(lookup.json().order.id, order.id);

    const deliver = await h.call('POST', `/api/store/retail/${order.id}/deliver`, manager, {
      storeId: 'sh',
      code: order.pickupCode
    });
    assert.equal(deliver.statusCode, 200, deliver.body);
    assert.equal(deliver.json().order.status, 'delivered');
  } finally {
    await h.close();
  }
});

test('运营费用可手工录入、多店批量导入，并进入门店净利', async () => {
  const h = await harness();
  try {
    const admin = await h.login('13800000001');
    const before = await h.call('GET', '/api/admin/profit?range=today', admin);
    assert.equal(before.statusCode, 200, before.body);
    const beforeRow = before.json().rows.find((row: { storeId: string }) => row.storeId === 'sh');

    const added = await h.call('POST', '/api/admin/expenses', admin, {
      storeId: 'sh',
      date: toDateString(),
      category: 'labor',
      amount: '123.45',
      memo: 'QA 手工录入人力'
    });
    assert.equal(added.statusCode, 200, added.body);
    assert.equal(added.json().expense.amountCents, 12345);

    const csv = [
      '日期,门店,类别,金额,备注',
      `${toDateString()},上海·城市中心店,人力,200,QA 导入人力`,
      `${toDateString()},上海·西岸店,租金,300,QA 导入租金`
    ].join('\n');

    const preview = await h.call('POST', '/api/admin/expenses/preview', admin, { text: csv });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(preview.json().errors.length, 0);
    assert.equal(preview.json().rows.length, 2);
    assert.equal(preview.json().totalCents, 50000);

    const imported = await h.call('POST', '/api/admin/expenses/import', admin, { text: csv });
    assert.equal(imported.statusCode, 200, imported.body);
    assert.equal(imported.json().created, 2);
    assert.equal(imported.json().storeCount, 2);

    const after = await h.call('GET', '/api/admin/profit?range=today', admin);
    const afterRow = after.json().rows.find((row: { storeId: string }) => row.storeId === 'sh');
    assert.equal(afterRow.opexCents - beforeRow.opexCents, 12345 + 20000);
    assert.equal(afterRow.netCents, afterRow.grossCents - afterRow.opexCents);
  } finally {
    await h.close();
  }
});

test('超阈值退款进入审批，财务审批后执行退款并记流水', async () => {
  const h = await harness();
  try {
    const { token } = await customerToken(h);
    const created = await h.call(
      'POST',
      '/api/customer/orders',
      token,
      freshOrderBody({ items: [{ productId: 'xing-0', qty: 3, temp: '热' }], type: 'takeaway' })
    );
    assert.equal(created.statusCode, 200, created.body);
    const order = created.json().order;
    assert.ok(order.totalCents >= 5000);

    const manager = await h.login('13800000004');
    const request = await h.call('POST', `/api/store/orders/${order.id}/refund`, manager, {
      reason: 'QA 全额退款'
    });
    assert.equal(request.statusCode, 200, request.body);
    assert.equal(request.json().mode, 'approval');
    const approvalId = request.json().approval.id;

    const finance = await h.login('13800000002');
    const decide = await h.call('POST', `/api/admin/approvals/${approvalId}/decide`, finance, {
      decision: 'approve',
      comment: 'QA 审批通过'
    });
    assert.equal(decide.statusCode, 200, decide.body);
    assert.equal(decide.json().approval.status, 'approved');

    const detail = await h.call('GET', `/api/store/orders/${order.id}`, manager);
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().order.status, 'refunded');
    assert.equal(detail.json().order.refundedCents, order.totalCents);

    const financeList = await h.call('GET', '/api/admin/finance?range=today', finance);
    assert.equal(financeList.statusCode, 200, financeList.body);
    assert.ok(
      financeList
        .json()
        .entries.some((entry: { type: string; orderId: string }) => entry.type === 'REFUND' && entry.orderId === order.id)
    );
  } finally {
    await h.close();
  }
});

test('门店范围与权限在后端强制生效', async () => {
  const h = await harness();
  try {
    const region = await h.login('13800000003');
    const overview = await h.call('GET', '/api/admin/overview', region);
    assert.equal(overview.statusCode, 200, overview.body);
    const storeIds = new Set(
      overview.json().overview.byStore.map((row: { storeId: string }) => row.storeId)
    );
    assert.ok(storeIds.size > 0);
    assert.ok([...storeIds].every((id) => id === 'sh' || id === 'sh-west' || id === 'brand'));
    assert.ok(!storeIds.has('bj'));
    assert.ok(!storeIds.has('bj-east'));

    const denied = await h.call('GET', '/api/store/overview?storeId=bj', region);
    assert.equal(denied.statusCode, 403);

    const manager = await h.login('13800000004');
    const expenseDenied = await h.call('POST', '/api/admin/expenses', manager, {
      storeId: 'sh',
      date: toDateString(),
      category: 'labor',
      amount: '10'
    });
    assert.equal(expenseDenied.statusCode, 403);

    const financeDenied = await h.call('GET', '/api/admin/finance', manager);
    assert.equal(financeDenied.statusCode, 403);

    const staffList = await h.call('GET', '/api/admin/staff', await h.login('13800000001'));
    assert.equal(staffList.statusCode, 200, staffList.body);
    assert.ok(staffList.json().staff.length >= 6);
  } finally {
    await h.close();
  }
});

test('操作记录返回 actorName / storeName 供界面直接渲染', async () => {
  const h = await harness();
  try {
    const admin = await h.login('13800000001');
    const res = await h.call('GET', '/api/admin/logs', admin);
    assert.equal(res.statusCode, 200, res.body);
    const logs = res.json().logs;
    assert.ok(Array.isArray(logs));
    assert.ok(logs.length > 0);
    const entry = logs[0];
    assert.equal(typeof entry.actorName, 'string');
    assert.ok('storeName' in entry);
    assert.ok('orderId' in entry);
    assert.ok(!('actor' in entry));
  } finally {
    await h.close();
  }
});
