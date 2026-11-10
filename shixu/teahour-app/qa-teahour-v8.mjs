// 时叙三端联调验收：后端健康 → 顾客小程序(H5)下单 → 门店营业台出餐 → 零售跨店核销 → 总部后台各页渲染
// 仅本地演示环境，不接真实支付/打印/设备。
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = '/tmp/teahour-v8-qa';
fs.mkdirSync(OUT, { recursive: true });

// 地址可用环境变量覆盖（本机 5173/5174 被别的项目占用时用得上）：
// MP_URL=http://localhost:5180/ ADMIN_URL=http://localhost:5181/ API_URL=http://localhost:8787/api
const MP = process.env.MP_URL || 'http://localhost:5174/';
const ADMIN = process.env.ADMIN_URL || 'http://localhost:5173/';
const API = process.env.API_URL || 'http://localhost:8787/api';
const errors = [];
const steps = [];

const log = (msg) => {
  steps.push(msg);
  console.log('✓', msg);
};

function watch(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${label}] console: ${msg.text()} @ ${msg.location().url}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
      console.log(`  [${label}] HTTP ${res.status()} ${res.url()}`);
    }
  });
}

async function waitText(locator, regex, timeout = 15000) {
  const end = Date.now() + timeout;
  let last = '';
  while (Date.now() < end) {
    try {
      last = await locator.innerText({ timeout: 1000 });
      if (regex.test(last)) return last;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`等待文本 ${regex} 超时，当前内容：${last.slice(0, 200)}`);
}

const browser = await chromium.launch({ channel: 'chrome' });

try {
  // ---------- 1. 后端 ----------
  const health = await fetch(`${API}/health`).then((res) => res.json());
  if (!health.ok || health.hardware !== 'mock') throw new Error(`后端健康检查异常：${JSON.stringify(health)}`);
  log(`后端健康 ${API}/health · hardware=${health.hardware}`);

  // ---------- 2. 顾客小程序 H5 ----------
  const mpCtx = await browser.newContext({
    viewport: { width: 400, height: 900 },
    deviceScaleFactor: 2,
    locale: 'zh-CN'
  });
  const mp = await mpCtx.newPage();
  watch(mp, 'mp');
  await mp.goto(MP, { waitUntil: 'domcontentloaded' });
  await mp.waitForSelector('.tea-hero', { timeout: 30000 });
  log('小程序首页渲染');
  await mp.screenshot({ path: `${OUT}/01-mp-home.png` });

  // 选门店：明确选上海·城市中心店，保证与店长范围一致
  await mp.locator('.store-trigger:visible').first().click();
  await mp.waitForSelector('.store-option', { timeout: 10000 });
  await mp.screenshot({ path: `${OUT}/02-mp-store-sheet.png` });
  const targetStore = mp.locator('.store-option', { hasText: '城市中心店' }).first();
  await targetStore.locator('.btn').click();
  await mp.waitForTimeout(800);
  log('小程序选择门店：城市中心店');

  // 点一杯鲜酿
  await mp.locator('.nav-bottom uni-button').nth(1).click();
  await mp.waitForSelector('.product-row .add-btn', { timeout: 15000 });
  await mp.locator('.product-row .add-btn').first().click();
  await mp.waitForSelector('.sheet-footer .btn.primary', { timeout: 10000 });
  await mp.locator('.sheet-footer .btn.primary').click();
  await mp.waitForTimeout(700);
  await mp.screenshot({ path: `${OUT}/03-mp-added.png` });

  // 结算 + 模拟支付（需在确认门店弹层二次确认）
  await mp.locator('.bag-bar uni-button').click();
  await mp.waitForSelector('text=模拟微信支付', { timeout: 10000 });
  await mp.screenshot({ path: `${OUT}/04-mp-checkout.png` });
  await mp.locator('.btn.primary.full', { hasText: '模拟微信支付' }).click();
  await mp.waitForSelector('text=门店正确，继续支付', { timeout: 10000 });
  await mp.locator('.sheet-footer .btn.primary', { hasText: '继续支付' }).click();
  await mp.waitForSelector('.receipt', { timeout: 15000 });
  const freshNumber = (await mp.locator('.order-number').innerText()).trim();
  const cupLabel = (await mp.locator('.cup-row .grow').first().innerText()).trim();
  if (!/^A\d{3}$/.test(freshNumber)) throw new Error(`鲜酿单号异常：${freshNumber}`);
  if (!new RegExp(`^${freshNumber}-1$`).test(cupLabel)) throw new Error(`杯贴标签异常：${cupLabel}`);
  log(`小程序鲜酿下单 ${freshNumber} · 杯贴 ${cupLabel}`);
  await mp.screenshot({ path: `${OUT}/05-mp-receipt-fresh.png` });

  // 带回家（零售）
  await mp.locator('.nav-bottom uni-button').nth(2).click();
  await mp.waitForSelector('.product-row .add-btn', { timeout: 15000 });
  await mp.locator('.product-row .add-btn').first().click();
  await mp.waitForSelector('.sheet-footer .btn.primary', { timeout: 10000 });
  await mp.locator('.sheet-footer .btn.primary').click();
  await mp.waitForTimeout(700);
  await mp.locator('.bag-bar uni-button').click();
  await mp.waitForSelector('text=模拟微信支付', { timeout: 10000 });
  await mp.locator('.btn.primary.full', { hasText: '模拟微信支付' }).click();
  await mp.waitForSelector('text=门店正确，继续支付', { timeout: 10000 });
  await mp.locator('.sheet-footer .btn.primary', { hasText: '继续支付' }).click();
  await mp.waitForSelector('.pickup-code.full', { timeout: 15000 });
  const pickupCode = (await mp.locator('.pickup-code.full').innerText()).trim();
  if (!/^\d{4}$/.test(pickupCode)) throw new Error(`提货码异常：${pickupCode}`);
  const retailNumber = (await mp.locator('.order-number').innerText()).trim();
  log(`小程序零售下单 ${retailNumber} · 提货码 ${pickupCode}`);
  await mp.screenshot({ path: `${OUT}/06-mp-receipt-retail.png` });

  await mp.locator('.nav-bottom uni-button').nth(4).click();
  await mp.waitForSelector('.profile-identity', { timeout: 10000 });
  await mp.locator('.qr-shortcut').click();
  await mp.waitForSelector('.member-qr', { timeout: 10000 });
  const memberCode = (await mp.locator('.member-code').innerText()).trim();
  if (!memberCode.startsWith('TH-')) throw new Error(`会员码异常：${memberCode}`);
  log(`小程序个人页会员码 ${memberCode}`);
  await mp.screenshot({ path: `${OUT}/07-mp-member.png` });

  // ---------- 3. 门店营业台（平板宽度） ----------
  const storeCtx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'zh-CN' });
  const store = await storeCtx.newPage();
  watch(store, 'store');
  await store.goto(`${ADMIN}login`, { waitUntil: 'domcontentloaded' });
  await store.fill('input[autocomplete="username"]', '13800000004');
  await store.fill('input[type="password"]', 'teahour2026');
  await store.locator('button[type="submit"]').click();
  await store.waitForURL('**/store/workbench', { timeout: 20000 });
  await store.waitForSelector('.queue-card', { timeout: 20000 });
  const freshCardQueue = store.locator('.queue-card', { hasText: freshNumber });
  await freshCardQueue.locator('.queue-no').first().waitFor({ timeout: 15000 });
  await waitText(freshCardQueue.locator('.queue-no').first(), new RegExp(freshNumber));
  log(`营业台登录并看到小程序订单 ${freshNumber}`);
  await store.screenshot({ path: `${OUT}/08-store-workbench.png` });

  const scanBox = store.locator('input[placeholder="例如 A001-1"]');
  await scanBox.fill(cupLabel);
  await store.locator('button', { hasText: '确认出餐' }).click();
  await waitText(store.locator('.scan-banner'), /已出餐/);
  log(`营业台扫码出餐 ${cupLabel}`);

  // 回到小程序确认订单状态已联动为待取餐
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.waitForSelector('.tea-hero', { timeout: 30000 });
  await mp.locator('.nav-bottom uni-button').nth(3).click();
  await mp.waitForSelector('.order-card-no', { timeout: 15000 });
  const freshCard = mp.locator('.mini-card', { hasText: freshNumber }).first();
  await waitText(freshCard, /待取餐/);
  log('小程序订单状态联动：待取餐');
  await mp.screenshot({ path: `${OUT}/09-mp-orders-ready.png` });

  // 营业台零售核销
  await store.locator('.side-link', { hasText: '零售提取' }).click();
  const codeInput = store.locator('input[aria-label="四位提货码"]');
  await codeInput.waitFor({ timeout: 10000 });
  await codeInput.fill(pickupCode);
  await store.waitForSelector('.delivery-card', { timeout: 15000 });
  await store.locator('button', { hasText: '确认已交付' }).click();
  await waitText(store.locator('.delivery-card'), /已交付/);
  log(`营业台零售核销 ${pickupCode}`);

  // 本店在售 / 报损登记 / 订单记录
  await store.locator('.side-link', { hasText: '本店在售' }).click();
  await store.waitForSelector('.inventory-row', { timeout: 15000 });
  await store.screenshot({ path: `${OUT}/10-store-inventory.png` });
  log('营业台本店在售渲染');

  await store.locator('.side-link', { hasText: '报损登记' }).click();
  await store.waitForSelector('.page-head', { timeout: 15000 });
  await waitText(store.locator('.page-head'), /报损/);
  await store.screenshot({ path: `${OUT}/11-store-loss.png` });
  log('营业台报损登记渲染');

  await store.locator('.side-link', { hasText: '订单记录' }).click();
  await store.waitForSelector('.page-head', { timeout: 15000 });
  await store.screenshot({ path: `${OUT}/12-store-orders.png` });
  log('营业台订单记录渲染');

  // ---------- 4. 总部后台 ----------
  const hqCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const hq = await hqCtx.newPage();
  watch(hq, 'hq');
  await hq.goto(`${ADMIN}login`, { waitUntil: 'domcontentloaded' });
  await hq.fill('input[autocomplete="username"]', '13800000001');
  await hq.fill('input[type="password"]', 'teahour2026');
  await hq.locator('button[type="submit"]').click();
  await hq.waitForURL('**/admin/overview', { timeout: 20000 });
  await waitText(hq.locator('.page-head'), /经营概览/);
  await hq.waitForTimeout(1200);
  await hq.screenshot({ path: `${OUT}/13-hq-overview.png` });
  log('总部经营概览渲染');

  const sections = [
    ['财务流水', /财务流水/],
    ['门店利润', /门店利润/],
    ['运营费用', /运营费用/],
    ['审批中心', /审批/],
    ['报损与损耗', /报损/],
    ['商品目录', /商品/],
    ['门店配置', /门店/],
    ['账号管理', /账号/],
    ['角色权限', /角色/],
    ['操作记录', /操作记录/]
  ];
  for (const [label, heading] of sections) {
    await hq.locator('.side-link', { hasText: label }).click();
    await hq.waitForTimeout(700);
    await waitText(hq.locator('.page-head'), heading);
    const inline = await hq.locator('.inline-error').count();
    if (inline > 0) {
      const text = await hq.locator('.inline-error').first().innerText();
      throw new Error(`总部「${label}」出现错误提示：${text}`);
    }
  }
  await hq.screenshot({ path: `${OUT}/14-hq-last.png` });
  log('总部 10 个页面全部渲染且无错误提示');

  // 店长不应看到总部财务（权限分流）
  const staffCtx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'zh-CN' });
  const staff = await staffCtx.newPage();
  watch(staff, 'staff');
  await staff.goto(`${ADMIN}login`, { waitUntil: 'domcontentloaded' });
  await staff.fill('input[autocomplete="username"]', '13800000005');
  await staff.fill('input[type="password"]', 'teahour2026');
  await staff.locator('button[type="submit"]').click();
  await staff.waitForURL('**/store/workbench', { timeout: 20000 });
  const adminNav = await staff.locator('.side-link', { hasText: '财务流水' }).count();
  if (adminNav !== 0) throw new Error('店员账号出现了总部财务导航');
  log('店员权限分流正确：仅营业台导航');

  // ---------- 汇总 ----------
  if (errors.length) {
    console.error('\n浏览器错误：');
    errors.forEach((line) => console.error(' -', line));
    throw new Error(`浏览器出现 ${errors.length} 条错误`);
  }
  console.log(`\n全部通过：${steps.length} 项检查，截图目录 ${OUT}`);
} catch (error) {
  console.error('\n验收失败：', error.message);
  if (errors.length) errors.forEach((line) => console.error(' -', line));
  process.exitCode = 1;
} finally {
  await browser.close();
}
