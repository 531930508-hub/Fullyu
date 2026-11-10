// 时叙状态与边界验收：双语持久化、空态、弹层关闭、温度/冰量、错误态、横向溢出、坏图、axe 可访问性
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const OUT = '/tmp/teahour-v8-qa';
const MP = process.env.MP_URL || 'http://localhost:5174/';
const ADMIN = process.env.ADMIN_URL || 'http://localhost:5173/';
const errors = [];
const steps = [];
const log = (msg) => {
  steps.push(msg);
  console.log('✓', msg);
};
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
};

function watch(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(`[${label}] console: ${msg.text()} @ ${msg.location().url}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
}

async function waitText(locator, regex, timeout = 12000) {
  const end = Date.now() + timeout;
  let last = '';
  while (Date.now() < end) {
    try {
      last = await locator.innerText({ timeout: 800 });
      if (regex.test(last)) return last;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`等待 ${regex} 超时，当前：${last.slice(0, 150)}`);
}

async function pageHealth(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, `${label} 横向溢出 ${overflow}px`);
  const broken = await page.evaluate(() =>
    Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).length
  );
  assert(broken === 0, `${label} 有 ${broken} 张坏图`);
  log(`${label} 无横向溢出/坏图`);
}

async function axeScan(page, label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of serious) {
    console.log(`  [axe] ${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} => ${n.html.slice(0, 120)}`).join(' | ')}`);
  }
  assert(serious.length === 0, `${label} axe 严重违规：${serious.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`);
  log(`${label} axe 无严重/致命违规`);
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  // ---------------- 顾客端状态 ----------------
  const mpCtx = await browser.newContext({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const mp = await mpCtx.newPage();
  watch(mp, 'mp');
  await mp.goto(MP, { waitUntil: 'domcontentloaded' });
  await mp.waitForSelector('.tea-hero', { timeout: 30000 });
  await mp.locator('.store-trigger:visible').first().click();
  await mp.waitForSelector('.store-option');
  await mp.locator('.store-option', { hasText: '城市中心店' }).first().locator('.btn').click();
  await mp.waitForTimeout(600);

  // 空订单（新顾客会话）
  await mp.locator('.nav-bottom uni-button').nth(3).click();
  await waitText(mp.locator('.empty'), /第一杯/);
  log('新顾客订单空态');

  // 英文切换 + 冷启动保持
  await mp.locator('.nav-bottom uni-button').nth(0).click();
  await mp.locator('.language-switch').click();
  await mp.waitForSelector('.locale-en', { timeout: 5000 });
  await mp.waitForFunction(() => document.querySelector('.mini-logo img')?.getAttribute('src')?.includes('logo-en'), null, { timeout: 5000 });
  const logoSrc = await mp.locator('.mini-logo img').getAttribute('src');
  assert(logoSrc && logoSrc.includes('logo-en'), `英文 logo 未切换：${logoSrc}`);
  await mp.locator('.nav-bottom uni-button').nth(1).click();
  await waitText(mp.locator('.screen'), /THE TEA MENU/);
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.waitForSelector('.locale-en', { timeout: 30000 });
  assert((await mp.locator('.mini-logo img').getAttribute('src')).includes('logo-en'), '冷启动后未保持英文');
  log('中英切换与冷启动保持');
  await mp.locator('.language-switch').click();
  await mp.waitForTimeout(400);

  // 商品弹层 Esc 关闭
  await mp.locator('.nav-bottom uni-button').nth(1).click();
  await mp.waitForSelector('.product-row .add-btn');
  const expand = mp.locator('.product-list .text-btn.full');
  if (await expand.count()) await expand.click();
  await mp.waitForTimeout(400);
  const coldRow = mp.locator('.product-row', { hasText: '庆·花园' }).first();
  await coldRow.locator('.add-btn').click();
  await mp.waitForSelector('.sheet', { timeout: 8000 });
  await mp.keyboard.press('Escape');
  await mp.waitForSelector('.sheet', { state: 'detached', timeout: 5000 });
  log('商品弹层 Esc 关闭');

  // 温度/冰量联动 + 购物袋合并
  await coldRow.locator('.add-btn').click();
  await mp.waitForSelector('.sheet .option');
  const hotSelected = await mp.locator('.option.selected').first().innerText();
  assert(hotSelected.includes('热'), `默认未选中热：${hotSelected}`);
  assert((await mp.locator('.option-title', { hasText: '冰量' }).count()) === 0, '热饮不应显示冰量');
  await mp.locator('.option', { hasText: '冰' }).first().click();
  await mp.waitForTimeout(300);
  const iceTitle = mp.locator('.option-title', { hasText: '冰量' });
  await iceTitle.waitFor({ timeout: 5000 });
  const iceGroup = iceTitle.locator('xpath=following-sibling::*[1]');
  const iceOptions = await iceGroup.locator('.option').allInnerTexts();
  assert(['少冰', '标准冰', '去冰'].every((x) => iceOptions.some((y) => y.includes(x))), `冰量选项不全：${iceOptions}`);
  const iceSelected = await iceGroup.locator('.option.selected').innerText();
  assert(iceSelected.includes('标准冰'), `冷饮默认不是标准冰：${iceSelected}`);
  await mp.locator('.sheet-footer .cart-qty').nth(1).click();
  await mp.locator('.sheet-footer .btn.primary').click();
  await mp.waitForTimeout(600);
  log('温度/冰量联动与数量 +1');

  // 再加一杯热饮（独立行）
  await coldRow.locator('.add-btn').click();
  await mp.waitForSelector('.sheet .btn.primary');
  await mp.locator('.sheet-footer .btn.primary').click();
  await mp.waitForTimeout(600);

  await mp.locator('.bag-bar uni-button').click();
  await mp.waitForSelector('.checkout-item', { timeout: 10000 });
  const lines = await mp.locator('.checkout-item').count();
  assert(lines === 2, `结算页应有 2 条购物袋行，实际 ${lines}`);
  const coldLine = mp.locator('.checkout-item').filter({ hasText: '冰' }).first();
  assert(/2/.test(await coldLine.innerText()), '冰饮行数量未合并为 2');
  log('结算页购物袋合并与冰量摘要');

  await mp.locator('.btn.primary.full', { hasText: '模拟微信支付' }).click();
  await mp.locator('.sheet-footer .btn.primary', { hasText: '继续支付' }).click();
  await mp.waitForSelector('.receipt', { timeout: 15000 });
  const cups = await mp.locator('.cup-progress .cup-row').count();
  assert(cups === 3, `小票逐杯应为 3，实际 ${cups}`);
  await waitText(mp.locator('.cup-progress'), /0\/3/);
  log('小票逐杯 3 杯且均待制作');
  await mp.screenshot({ path: `${OUT}/20-mp-ice-receipt.png` });

  await pageHealth(mp, '小程序');
  await axeScan(mp, '小程序');

  // ---------------- 营业台：非法杯贴 + 错误提示 ----------------
  const storeCtx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'zh-CN' });
  const store = await storeCtx.newPage();
  watch(store, 'store');
  await store.goto(`${ADMIN}login`, { waitUntil: 'domcontentloaded' });
  await store.fill('input[autocomplete="username"]', '13800000004');
  await store.fill('input[type="password"]', 'teahour2026');
  await store.locator('button[type="submit"]').click();
  await store.waitForURL('**/store/workbench', { timeout: 20000 });
  await store.waitForSelector('.queue-card', { timeout: 20000 });
  await store.fill('input[placeholder="例如 A001-1"]', 'ZZZ-999');
  await store.locator('button', { hasText: '确认出餐' }).click();
  await store.waitForSelector('.scan-banner.error', { timeout: 10000 });
  const scanError = await store.locator('.scan-banner').innerText();
  assert(/不存在|未找到|无效|无法|失败/.test(scanError), `非法杯贴未给出错误：${scanError}`);
  log('营业台非法杯贴错误提示');
  await pageHealth(store, '营业台');
  await axeScan(store, '营业台');

  // ---------------- 后台：概览接口失败内联错误 ----------------
  const hqCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const hq = await hqCtx.newPage();
  watch(hq, 'hq');
  await hq.route('**/api/admin/overview*', (route) => route.abort('failed'));
  await hq.goto(`${ADMIN}login`, { waitUntil: 'domcontentloaded' });
  await hq.fill('input[autocomplete="username"]', '13800000001');
  await hq.fill('input[type="password"]', 'teahour2026');
  await hq.locator('button[type="submit"]').click();
  await hq.waitForURL('**/admin/overview', { timeout: 20000 });
  await hq.waitForSelector('.inline-error', { timeout: 15000 });
  log('后台概览接口失败显示内联错误');
  await hq.unroute('**/api/admin/overview*');
  await hq.reload({ waitUntil: 'domcontentloaded' });
  await hq.waitForSelector('.page-head', { timeout: 20000 });
  await hq.waitForTimeout(1200);
  await pageHealth(hq, '后台');
  await axeScan(hq, '后台');

  // 故意注入的失败（非法杯贴、概览接口中断）会各产生一条网络错误，属于本脚本的预期结果。
  const unexpected = errors.filter(
    (line) => !line.includes('/api/store/scan') && !line.includes('/api/admin/overview') && !line.includes('ERR_FAILED')
  );
  if (unexpected.length) throw new Error(`浏览器错误 ${unexpected.length} 条：\n${unexpected.join('\n')}`);
  console.log(`\n全部通过：${steps.length} 项状态检查`);
} catch (error) {
  console.error('\n状态验收失败：', error.message);
  if (errors.length) errors.forEach((line) => console.error(' -', line));
  process.exitCode = 1;
} finally {
  await browser.close();
}
