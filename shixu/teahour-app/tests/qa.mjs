// 端到端回归：顾客下单 → 营业台逐杯扫码 → 零售提货 → 总部费用录入/导入 → 利润核对
// 运行：QA_BASE=http://localhost:8787 node tests/qa.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.QA_BASE || 'http://localhost:8787';
const SHOT = '/tmp/qa-shots';
mkdirSync(SHOT, { recursive: true });
const errors = [];
const consoleErrors = [];

function watch(page, label) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`${label}: ${msg.text()}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 500 && res.url().includes('/api/')) errors.push(`${label}: ${res.status()} ${res.url()}`);
  });
}

async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth;
  });
  if (overflow > 2) errors.push(`${label}: 横向溢出 ${overflow}px`);
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage });
}

async function staffLogin(page, username) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[inputmode="numeric"]', username);
  await page.fill('input[type="password"]', 'teahour2026');
  await page.click('button[type="submit"]');
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/* ---------------- 顾客端（移动端视口） ---------------- */
const customerContext = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const customer = await customerContext.newPage();
watch(customer, 'customer');
await customer.goto(BASE + '/', { waitUntil: 'networkidle' });
await customer.waitForSelector('.tea-hero', { timeout: 20000 });
await shot(customer, '01-customer-now');
await noOverflow(customer, '顾客-此刻');

// 选定门店（上海·城市中心店 = 营业台演示账号 13800000004 所在店）
await customer.click('.store-trigger');
await customer.waitForSelector('dialog.sheet[open]');
await customer.click('dialog.sheet .store-option:has-text("上海·城市中心店") .btn');
await customer.waitForTimeout(400);

// 会员码（个人页 QR 入口）
await customer.locator('.nav-bottom button').nth(4).click();
await customer.waitForTimeout(400);
await customer.click('.qr-shortcut');
await customer.locator('.member-qr img').waitFor({ state: 'visible', timeout: 8000 });
await shot(customer, '02-customer-member');
await customer.getByRole('button', { name: '收好' }).click();
await customer.waitForTimeout(300);

// 回首页再进茶单（个人页无门店入口）
await customer.locator('.nav-bottom button').nth(0).click();
await customer.waitForTimeout(400);

// 茶单 → 展开全部 → 下一杯鲜酿
await customer.locator('.nav-bottom button').nth(1).click();
await customer.waitForTimeout(400);
await customer.click('.text-btn.full');
await customer.waitForTimeout(300);
await shot(customer, '03-customer-tea');
await noOverflow(customer, '顾客-茶单');

const productName = (await customer.locator('.product-row').first().locator('h3').textContent())?.trim() || '';
await customer.locator('.product-row').first().locator('.product-hit').click();
await customer.waitForSelector('dialog.sheet[open]');
await shot(customer, '04-customer-product');
await customer.locator('dialog.sheet').getByRole('button', { name: /加入购物袋/ }).click();
await customer.waitForTimeout(500);

await customer.locator('.bag-bar button').click();
await customer.waitForTimeout(500);
await shot(customer, '05-customer-checkout');
await customer.getByRole('button', { name: /模拟微信支付/ }).click();
await customer.waitForSelector('dialog.sheet[open]');
await customer.locator('dialog.sheet').getByRole('button', { name: /门店正确，继续支付/ }).click();
await customer.waitForSelector('.receipt', { timeout: 10000 });
await customer.waitForTimeout(500);
const freshOrderNo = ((await customer.locator('.order-number').textContent())?.trim() || '').match(/[AB]\d{3}/)?.[0] || '';
if (!freshOrderNo) errors.push('顾客端：鲜酿单号缺失');
console.log('customer fresh order:', freshOrderNo, 'product:', productName);
await shot(customer, '06-customer-success');
await customer.getByRole('button', { name: '回到此刻' }).click();
await customer.waitForTimeout(400);

// 订单列表
await customer.locator('.nav-bottom button').nth(3).click();
await customer.waitForTimeout(600);
await shot(customer, '07-customer-orders');
await noOverflow(customer, '顾客-订单');
const viewOrder = customer.getByRole('button', { name: /查看订单/ }).first();
if (await viewOrder.count()) {
  await viewOrder.click();
  await customer.waitForSelector('.receipt', { timeout: 8000 });
  await shot(customer, '08-customer-order-detail');
  await customer.getByRole('button', { name: '回到此刻' }).click();
  await customer.waitForTimeout(300);
}

// 零售：带回家 → 加入购物袋 → 结算 → 提货码
await customer.locator('.nav-bottom button').nth(2).click();
await customer.waitForTimeout(500);
await shot(customer, '09-customer-retail');
await customer.locator('.add-btn').first().click();
await customer.waitForSelector('dialog.sheet[open]');
await customer.locator('dialog.sheet').getByRole('button', { name: /加入购物袋/ }).click();
await customer.waitForTimeout(500);
await customer.locator('.bag-bar button').click();
await customer.waitForTimeout(500);
await customer.getByRole('button', { name: /模拟微信支付/ }).click();
await customer.waitForSelector('dialog.sheet[open]');
await customer.locator('dialog.sheet').getByRole('button', { name: /门店正确，继续支付/ }).click();
await customer.waitForSelector('.receipt', { timeout: 10000 });
await customer.waitForTimeout(500);
const retailCode = (await customer.locator('.pickup-code.full').textContent())?.trim();
const retailOrderNo = ((await customer.locator('.order-number').textContent())?.trim() || '').match(/TH-R-\d{8}-\d{4}/)?.[0] || '';
if (!retailCode || retailCode.length !== 4) errors.push(`顾客端：零售提货码异常 (${retailCode})`);
if (!retailOrderNo) errors.push('顾客端：零售单号缺失');
console.log('customer retail order:', retailOrderNo, 'pickup code:', retailCode);
await shot(customer, '10-customer-retail-success');
await customer.getByRole('button', { name: '回到此刻' }).click();
await customer.waitForTimeout(300);

// 顾客端长页
await customer.locator('.nav-bottom button').nth(0).click();
await customer.waitForTimeout(400);
await shot(customer, '11-customer-mobile-full', true);
await noOverflow(customer, '顾客-此刻长页');

// 桌面顾客端
const customerDesktop = await browser.newPage({ viewport: { width: 1440, height: 950 } });
watch(customerDesktop, 'customer-desktop');
await customerDesktop.goto(BASE + '/', { waitUntil: 'networkidle' });
await customerDesktop.waitForSelector('.tea-hero', { timeout: 20000 });
await shot(customerDesktop, '12-customer-desktop');
await customerDesktop.close();

/* ---------------- 门店营业台 ---------------- */
const storeContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const store = await storeContext.newPage();
watch(store, 'store');
await staffLogin(store, '13800000004');
await store.waitForURL(/\/store\/workbench/, { timeout: 15000 });
await store.waitForLoadState('networkidle');
await store.waitForTimeout(800);
await shot(store, '13-store-workbench');
await noOverflow(store, '营业台');

if (freshOrderNo) {
  const card = store.locator('.queue-card', { hasText: freshOrderNo });
  await card.waitFor({ timeout: 10000 });
  const labels = await card.locator('.cup-label').allTextContents();
  for (const label of labels) {
    await store.getByLabel('杯贴编号').fill(label.trim());
    await store.getByLabel('杯贴编号').press('Enter');
    await store.waitForTimeout(350);
  }
  await store.waitForTimeout(800);
  await shot(store, '14-store-after-scan');
  const stillThere = await card.count();
  const waiting = stillThere ? await card.locator('.cup-state', { hasText: '等待扫码' }).count() : 0;
  console.log('store scanned', labels.length, 'cups; card remaining:', stillThere, 'waiting cups:', waiting);
  if (waiting) errors.push('营业台：扫码后仍有杯贴处于等待扫码');
}

// 零售提取
await store.getByRole('button', { name: '零售提取', exact: true }).click();
await store.getByRole('heading', { name: /零售提取/, level: 1 }).waitFor();
await shot(store, '15-store-retail');
if (retailCode) {
  await store.getByLabel('四位提货码').fill(retailCode);
  await store.getByRole('button', { name: /确认已交付/ }).waitFor({ timeout: 8000 });
  await store.getByRole('button', { name: /确认已交付/ }).click();
  await store.getByText(/已交付/).first().waitFor({ timeout: 8000 });
  await shot(store, '16-store-retail-delivered');
}
await noOverflow(store, '门店-零售提取');

/* ---------------- 总部后台 ---------------- */
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const admin = await adminContext.newPage();
watch(admin, 'admin');
await staffLogin(admin, '13800000001');
await admin.waitForURL(/\/admin\/overview/, { timeout: 15000 });
await admin.waitForLoadState('networkidle');
await admin.waitForTimeout(800);
await shot(admin, '17-admin-overview');
await noOverflow(admin, '后台-概览');

const sections = [
  ['finance', '财务流水', '18-admin-finance'],
  ['expenses', '运营费用', '28-admin-expenses'],
  ['profit', '门店利润', '19-admin-profit'],
  ['approvals', '审批中心', '20-admin-approvals'],
  ['losses', '报损与损耗', '21-admin-losses'],
  ['products', '商品目录', '22-admin-products'],
  ['mappings', '原料 SKU 映射', '23-admin-mappings'],
  ['stores', '门店配置', '24-admin-stores'],
  ['staff', '账号管理', '25-admin-staff'],
  ['roles', '角色权限', '26-admin-roles'],
  ['logs', '操作记录', '27-admin-logs']
];
for (const [key, heading, file] of sections) {
  await admin.goto(`${BASE}/admin/${key}`, { waitUntil: 'networkidle' });
  await admin.getByRole('heading', { name: heading, level: 1 }).waitFor({ timeout: 8000 });
  await shot(admin, file);
  await noOverflow(admin, `后台-${heading}`);
}

// 手工录入费用（每次运行唯一备注，避免重复导入跳过导致断言失效）
const runStamp = `R${Date.now().toString(36).toUpperCase()}`;
await admin.goto(`${BASE}/admin/expenses`, { waitUntil: 'networkidle' });
await admin.getByRole('heading', { name: '运营费用', level: 1 }).waitFor();
await admin.getByRole('button', { name: /手动录入/ }).click();
await admin.getByRole('dialog').locator('select').first().selectOption({ index: 1 });
await admin.getByLabel('金额（元）').fill('88.8');
await admin.getByLabel('备注').fill(`QA 手工 ${runStamp}`);
await shot(admin, '29-admin-expense-manual');
await admin.getByRole('button', { name: '保存费用' }).click();
await admin.getByText('费用已录入').waitFor({ timeout: 8000 });
await admin.getByText(`QA 手工 ${runStamp}`).first().waitFor({ timeout: 8000 });
await shot(admin, '30-admin-expense-saved');

// 批量导入
const today = new Date().toLocaleDateString('sv-SE');
await admin.getByRole('button', { name: /批量导入/ }).click();
const csv = [
  '日期,门店,类别,金额,备注',
  `${today},上海·城市中心店,人力,188.8,QA 导入人力 ${runStamp}`,
  `${today},北京·城市中心店,租金,288.8,QA 导入租金 ${runStamp}`
].join('\n');
await admin.getByLabel('CSV 内容').fill(csv);
await admin.getByRole('button', { name: '预览校验' }).click();
await admin.getByText(/确认导入 2 笔/).waitFor({ timeout: 8000 });
await shot(admin, '31-admin-expense-import-preview');
await admin.getByRole('button', { name: /确认导入 2 笔/ }).click();
await admin.getByText(/已导入 2 笔/).waitFor({ timeout: 8000 });
await shot(admin, '32-admin-expense-imported');
await admin.getByText(`QA 导入租金 ${runStamp}`).first().waitFor({ timeout: 8000 });

// 利润页核对费用已计入
await admin.goto(`${BASE}/admin/profit`, { waitUntil: 'networkidle' });
await admin.getByRole('heading', { name: '门店利润', level: 1 }).waitFor();
await shot(admin, '33-admin-profit-after');

// 平板与窄屏后台
for (const [width, height, file] of [
  [1024, 900, '34-admin-tablet'],
  [430, 900, '35-admin-mobile']
]) {
  await admin.setViewportSize({ width, height });
  await admin.goto(`${BASE}/admin/expenses`, { waitUntil: 'networkidle' });
  await admin.getByRole('heading', { name: '运营费用', level: 1 }).waitFor();
  await shot(admin, file);
  await noOverflow(admin, `后台-${width}`);
}

await browser.close();

console.log('\n--- page errors ---');
console.log(errors.length ? errors.join('\n') : 'none');
console.log('\n--- console errors ---');
console.log(consoleErrors.length ? consoleErrors.slice(0, 20).join('\n') : 'none');
if (errors.length || consoleErrors.length) process.exitCode = 1;
