// 现场演示截图：三端当前运行状态（真实点一遍，不做断言，纯取图）
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const MP = process.env.MP_URL || 'http://localhost:5174/';
const ADMIN = process.env.ADMIN_URL || 'http://localhost:5181/';
const OUT = '/tmp/teahour-live';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  ✓ ' + name);
};
const TAB = { 此刻: 0, 茶单: 1, 带回家: 2, 订单: 3, 我的: 4 };
const tab = async (mp, name) => {
  await mp.locator('.nav-bottom uni-button').nth(TAB[name]).click();
  await mp.waitForTimeout(900);
};

// ---------- 小程序：真实走一单 ----------
const mpCtx = await browser.newContext({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const mp = await mpCtx.newPage();
await mp.goto(MP, { waitUntil: 'networkidle' });
await mp.waitForTimeout(1200);
await shot(mp, '01-小程序-此刻');

await mp.locator('.store-trigger:visible').first().click();
await mp.waitForTimeout(700);
await shot(mp, '02-小程序-选门店');
await mp.locator('.store-option', { hasText: '城市中心店' }).first().locator('.btn').click();
await mp.waitForTimeout(700);

await tab(mp, '茶单');
await shot(mp, '03-小程序-茶单');
await mp.locator('.product-row .add-btn').first().click();
await mp.waitForTimeout(700);
await shot(mp, '04-小程序-规格面板');
await mp.locator('.sheet-footer .btn.primary').click();
await mp.waitForTimeout(600);
await shot(mp, '05-小程序-茶包已加入');

await mp.locator('.bag-bar uni-button').click();
await mp.waitForTimeout(800);
await shot(mp, '06-小程序-结算确认');
await mp.locator('.btn.primary.full', { hasText: '模拟微信支付' }).click();
await mp.waitForTimeout(900);
await mp.waitForSelector('text=门店正确，继续支付', { timeout: 10000 }).catch(() => {});
const confirm = mp.locator('.sheet-footer .btn.primary', { hasText: '继续支付' });
if (await confirm.count()) {
  await shot(mp, '07-小程序-支付前确认门店');
  await confirm.click();
}
await mp.waitForTimeout(1500);
await shot(mp, '08-小程序-下单成功杯贴');

await tab(mp, '带回家');
await shot(mp, '09-小程序-带回家');
await tab(mp, '订单');
await shot(mp, '10-小程序-订单列表');
await tab(mp, '我的');
await shot(mp, '11-小程序-我的');
const qr = mp.locator('.qr-shortcut');
if (await qr.count()) {
  await qr.click();
  await mp.waitForTimeout(800);
  await shot(mp, '12-小程序-会员码');
}

// ---------- 营业台 ----------
const posCtx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'zh-CN' });
const pos = await posCtx.newPage();
await pos.goto(ADMIN + 'login', { waitUntil: 'domcontentloaded' });
await pos.waitForTimeout(600);
await shot(pos, '13-登录页');
await pos.fill('input[autocomplete="username"]', '13800000004');
await pos.fill('input[type="password"]', 'teahour2026');
await pos.locator('button[type="submit"]').click();
await pos.waitForURL('**/store/workbench', { timeout: 20000 });
await pos.waitForTimeout(1500);
await shot(pos, '14-营业台-待出餐');

for (const [label, name] of [
  ['帮客人点单', '15-营业台-帮客人点单'],
  ['零售提取', '17-营业台-零售提取'],
  ['本店在售', '18-营业台-本店在售'],
  ['本店设备', '19-营业台-本店设备']
]) {
  const link = pos.locator('.side-link', { hasText: label }).first();
  if (!(await link.count())) { console.log('  – 无入口：' + label); continue; }
  await link.click();
  await pos.waitForTimeout(1300);
  if (label === '帮客人点单') {
    await pos.waitForSelector('.assisted-item', { timeout: 20000 });
    await pos.locator('.assisted-item').first().click();
    await pos.locator('.pos-member-box button', { hasText: '扫会员码' }).click();
    await pos.waitForSelector('.scan-frame.compact', { timeout: 10000 });
    await pos.locator('input[placeholder="TH-"]').fill('TH-261029-0001');
    await pos.locator('button', { hasText: '识别会员权益' }).click();
    await pos.waitForTimeout(1000);
    await shot(pos, name);
    await pos.locator('.cart-panel select').first().selectOption({ index: 1 }).catch(() => {});
    await pos.locator('.btn-primary.btn-block', { hasText: '收款' }).click();
    await pos.waitForSelector('.pay-mode-toggle', { timeout: 10000 });
    await pos.waitForTimeout(600);
    await shot(pos, '16-营业台-收款码');
    await pos.keyboard.press('Escape');
    await pos.waitForTimeout(500);
    continue;
  }
  await shot(pos, name);
}

// ---------- 总部后台 ----------
const hqCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const hq = await hqCtx.newPage();
await hq.goto(ADMIN + 'login', { waitUntil: 'domcontentloaded' });
await hq.fill('input[autocomplete="username"]', '13800000001');
await hq.fill('input[type="password"]', 'teahour2026');
await hq.locator('button[type="submit"]').click();
await hq.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
await hq.waitForTimeout(1800);
await shot(hq, '20-总部-经营概览');

for (const [label, name] of [
  ['财务流水', '21-总部-财务流水'],
  ['门店利润', '22-总部-门店利润'],
  ['运营费用', '23-总部-运营费用'],
  ['审批中心', '24-总部-审批中心'],
  ['报损与损耗', '25-总部-报损与损耗'],
  ['商品目录', '26-总部-商品目录'],
  ['门店配置', '27-总部-门店配置'],
  ['账号管理', '28-总部-账号管理'],
  ['角色权限', '29-总部-角色权限'],
  ['操作记录', '30-总部-操作记录']
]) {
  const link = hq.locator('.side-link', { hasText: label }).first();
  if (!(await link.count())) { console.log('  – 无入口：' + label); continue; }
  await link.click();
  await hq.waitForTimeout(1400);
  await shot(hq, name);
}

await browser.close();
console.log('\n截图目录 ' + OUT);
