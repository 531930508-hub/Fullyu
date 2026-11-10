/* 本地防御性审计：只创建临时合成数据，仅监听127.0.0.1；不接受外部BASE/数据库参数。
 * 从项目根执行：node docs/system-audit-2026-10-30/evidence/local-probes.cjs
 * 前置：shared/integrations/server已构建。输出仅含状态与布尔证据，不含令牌/密码/顾客信息。
 * 此脚本验证整改后的行为是否成立，不是“上线验收通过”测试。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const server = path.join(root, 'apps/server');
const req = createRequire(path.join(server, 'package.json'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'teahour-defensive-audit-'));
const env = {
  ...process.env,
  DATABASE_URL: `file:${path.join(temp, 'audit.db')}`,
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  INTEGRATIONS_MODE: 'mock',
  UPLOAD_ROOT: path.join(temp, 'uploads'),
  SEED_TRANSACTIONS: '0',
  SEED_FORCE: '0',
  SEED_PASSWORD: crypto.randomBytes(24).toString('hex')
};
Object.assign(process.env, env);
let app;
const results = [];
function evidence(id, observed) { results.push({ id, ...observed }); }
(async () => {
  execFileSync(process.execPath, [req.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(server, 'node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'], { cwd: server, env, stdio: 'pipe' });
  req('reflect-metadata');
  const { NestFactory } = req('@nestjs/core');
  const { AppModule, jwtSecret } = req('./dist/app.module.js');
  const { ApiExceptionFilter } = req('./dist/common/api-exception.filter.js');
  const { PrismaService } = req('./dist/common/prisma.service.js');
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  async function http(method, route, body, token) {
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
    return { status: res.status, body: await res.json() };
  }
  // SEC-01：会员码不再作为登录凭证；持码会话是全新匿名顾客，无法触及原顾客资料。
  const a = await http('POST', '/customer/session', { name: '隔离审计顾客' });
  const b = await http('POST', '/customer/session', { memberCode: a.body.customer.memberCode });
  const modified = await http('PUT', '/customer/profile', { name: '隔离审计改名' }, b.body.token);
  const owner = await http('GET', '/customer/me', undefined, a.body.token);
  evidence('SEC-01', { scenario: '会员码不构成登录凭证，持码会话是独立新顾客且改不到原顾客', sessionStatus: b.status, distinctCustomer: a.body.customer.id !== b.body.customer.id, writeStatus: modified.status, ownerNameUnchanged: owner.body.customer.name === '隔离审计顾客' });
  // SEC-02：未登录顾客目录不得包含成本或投料字段。
  const menu = await http('GET', '/customer/bootstrap?storeId=sh');
  evidence('SEC-02', { scenario: '未登录顾客目录不含成本与投料字段', httpStatus: menu.status, productCostField: menu.body.products.some(p => Object.hasOwn(p, 'costCents')), retailCostField: menu.body.retail.some(p => Object.hasOwn(p, 'costCents')), productDoseField: menu.body.products.some(p => Object.hasOwn(p, 'doseGrams')), retailDoseField: menu.body.retail.some(p => Object.hasOwn(p, 'doseGrams')) });
  // SEC-03：走系统内重置路径（管理员改动账号→会话版本+1），旧令牌立即失效。
  const credentials = { username: '13800000004', password: env.SEED_PASSWORD };
  const login = await http('POST', '/auth/login', credentials);
  const superLogin = await http('POST', '/auth/login', { username: '13800000001', password: env.SEED_PASSWORD });
  const prisma = app.get(PrismaService);
  const staffRow = await prisma.user.findUnique({ where: { username: credentials.username }, include: { roles: true } });
  const reset = await http('PATCH', `/admin/staff/${staffRow.id}`, {
    name: staffRow.name,
    password: 'audit-replacement-only',
    roleIds: staffRow.roles.map((x) => x.roleId),
    storeIds: ['sh']
  }, superLogin.body.token);
  const oldMe = await http('GET', '/auth/me', undefined, login.body.token);
  const oldReLogin = await http('POST', '/auth/login', credentials);
  evidence('SEC-03', { scenario: '管理员重置密码后旧令牌与旧密码立即失效', layer: 'HTTP', resetStatus: reset.status, oldTokenMeStatus: oldMe.status, oldPasswordLoginStatus: oldReLogin.status });
  // OPS-01：生产环境缺JWT配置必须启动拒绝，不允许静默回落。
  const keptSecret = process.env.JWT_SECRET;
  const keptMode = process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  let ops01Threw = false;
  try { jwtSecret(); } catch { ops01Threw = true; }
  evidence('OPS-01', { scenario: '生产环境缺JWT配置时启动拒绝', jwtSecretThrows: ops01Threw });
  process.env.JWT_SECRET = keptSecret;
  if (keptMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = keptMode;
  // OPS-02：生产且未显式指定渠道模式时必须落到 disabled，绝不静默回落 mock。
  const { loadIntegrationsConfig } = req('@teahour/integrations');
  evidence('OPS-02', { scenario: 'NODE_ENV=production且未指定渠道模式', actualMode: loadIntegrationsConfig({ uploadRoot: temp, assetUrl: k => k, env: { NODE_ENV: 'production' } }).mode });
  // 以下为服务层故障序列注入，不代表真实支付回调或设备已经联调。
  const { OrdersService } = req('./dist/orders/orders.service.js');
  const { StaffService } = req('./dist/auth/staff.service.js');
  const orders = app.get(OrdersService);
  const account = await prisma.user.findUnique({ where: { username: credentials.username } });
  const staff = await app.get(StaffService).load(account.id);
  const tea = await prisma.product.findFirst({ where: { kind: 'tea', status: 'published', doseG: { gt: 0 } } });
  const input = { storeId: 'sh', business: 'fresh', channel: 'mini', type: 'takeaway', customerId: a.body.customer.id, items: [{ productId: tea.id, qty: 1, temp: '热', ice: '标准冰' }] };
  // TX-13：同茶不同温度/冰量的两行必须保留为两行，不得合并。
  const mixed = await orders.createOrder({ ...input, items: [...input.items, { productId: tea.id, qty: 1, temp: '冰', ice: '少冰' }] });
  const mixedLines = await prisma.orderItem.findMany({ where: { orderId: mixed.order.id } });
  evidence('TX-13', { scenario: '同一茶饮热饮和冰饮保留两行', layer: 'service+database', submittedLineCount: 2, storedLineCount: mixedLines.length, storedTotalQty: mixedLines.reduce((n, x) => n + x.qty, 0), retainedDistinctOptions: new Set(mixedLines.map(x => `${x.temp}/${x.ice}`)).size });
  // TX-06：重复支付成功只记一次台账，打印任务不重复放大。
  const jobsBefore = await prisma.printJob.count({ where: { orderId: mixed.order.id } });
  await orders.markPaid(mixed.order.id, 'AUDIT-DUPLICATE-NO-EXTERNAL');
  evidence('TX-06', { scenario: '重复支付成功处理不重复记销售台账', layer: 'service+database', jobsBefore, jobsAfter: await prisma.printJob.count({ where: { orderId: mixed.order.id } }), saleEntries: await prisma.financeEntry.count({ where: { orderId: mixed.order.id, type: 'SALE' } }) });
  const stockQuery = { where: { storeId_productId: { storeId: 'sh', productId: tea.id } } };
  // TX-03：失败释放库存后，迟到成功消息恢复订单但绝不重新扣库。
  const beforeFailure = await prisma.stock.findUnique(stockQuery);
  const prepared = await orders.prepareLines(input, 'sh');
  const lateId = await orders.createUnpaidOrder(input, 'sh', prepared);
  await orders.markPaymentFailed(lateId, '隔离审计注入失败');
  const restored = await prisma.stock.findUnique(stockQuery);
  await orders.markPaid(lateId, 'AUDIT-LATE-NO-EXTERNAL');
  const afterLate = await prisma.stock.findUnique(stockQuery);
  const lateOrder = await orders.getOrderRow(lateId);
  evidence('TX-03', { scenario: '失败释放库存后迟到成功恢复订单但未重新扣库', layer: 'service sequence+database', stockReturned: restored.grams === beforeFailure.grams, afterLateStockStillRestored: afterLate.grams === beforeFailure.grams, orderStatus: lateOrder.status, paymentStatus: lateOrder.paymentStatus });
  // TX-05：部分退款后剩余杯数仍可正常扫码出餐，退款杯不可再扫。
  const partial = await orders.createOrder({ ...input, items: [{ ...input.items[0], qty: 2 }] });
  const partialLine = await prisma.orderItem.findFirst({ where: { orderId: partial.order.id } });
  const quoted = await orders.refundQuoteForOrder(partial.order.id, [{ itemId: partialLine.id, qty: 1 }]);
  await orders.executeRefund(staff, { order: quoted.order, quote: quoted.quote, reason: '隔离审计退款', prepared: false, approvalId: null, decidedBy: '隔离审计' });
  const cups = await prisma.orderUnit.findMany({ where: { orderId: partial.order.id } });
  for (const cup of cups.filter(x => x.status !== 'refunded')) await orders.scanUnitById(staff, partial.order.id, cup.id);
  let refundedCupScanRejected = false;
  try { await orders.scanUnitById(staff, partial.order.id, cups.find(x => x.status === 'refunded').id); } catch { refundedCupScanRejected = true; }
  const remainingLine = await prisma.orderItem.findUnique({ where: { id: partialLine.id } });
  evidence('TX-05', { scenario: '部分退款后剩余杯数可正常出餐且退款杯不可再扫', layer: 'service+database', paidRemainingQty: remainingLine.qty - remainingLine.refundedQty, refundedCupScanRejected, scannedUnitsAfter: await prisma.orderUnit.count({ where: { orderId: partial.order.id, status: 'scanned' } }) });
  // SEC-04：员工保留订单查看权限但门店授权为空时不得读到任何门店订单。
  // 密码已在 SEC-03 轮换，这里用轮换后的密码重新登录取新令牌。
  const relogin = await http('POST', '/auth/login', { username: credentials.username, password: 'audit-replacement-only' });
  await prisma.userStore.deleteMany({ where: { userId: account.id } });
  await prisma.user.update({ where: { id: account.id }, data: { allStores: false } });
  const emptyScopeOrders = await http('GET', '/store/orders', undefined, relogin.body.token);
  evidence('SEC-04', { scenario: '门店授权清空后员工读不到门店订单', layer: 'HTTP+database', httpStatus: emptyScopeOrders.status, authorizedStoreCount: await prisma.userStore.count({ where: { userId: account.id } }), leakedOrderCount: (emptyScopeOrders.body.orders || []).length });
  evidence('BASELINE', { scenario: '临时库由正式迁移创建并用关闭交易的种子初始化', migrationDeploySucceeded: true, baseRestrictedToLoopback: true, testDataOnly: true });
})().then(async () => {
  if (app) await app.close();
  fs.rmSync(temp, { recursive: true, force: true });
  const report = { checkedAt: new Date().toISOString(), method: 'local HTTP + isolated SQLite + current built modules; external providers mock; no production access', results, cleanedUp: true };
  fs.writeFileSync(path.join(__dirname, 'local-probes.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}).catch(async err => {
  if (app) await app.close().catch(() => {});
  fs.rmSync(temp, { recursive: true, force: true });
  console.error('本地审计未完成：', err.message);
  process.exitCode = 1;
});
