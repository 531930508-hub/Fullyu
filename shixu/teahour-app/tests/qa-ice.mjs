// 冰量/温度联动回归：商品弹层、购物袋合并、结算摘要、小票逐杯进度
// 运行：BASE_URL=http://localhost:8787 node tests/qa-ice.mjs
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL || 'http://localhost:8787';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const results = [];
const assert = (ok, label) => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) process.exitCode = 1;
};

await page.goto(base + '/');
await page.waitForSelector('.tea-hero', { timeout: 20000 });
await page.waitForTimeout(500);

// 选定门店（上海·城市中心店，与营业台演示账号同属一店）
await page.click('.store-trigger');
await page.waitForSelector('dialog.sheet[open]');
await page.click('dialog.sheet .store-option:has-text("上海·城市中心店") .btn');
await page.waitForTimeout(400);

// 进入茶单并展开全部商品
await page.locator('.nav-bottom button').nth(1).click();
await page.waitForTimeout(400);
await page.click('.text-btn.full');
await page.waitForTimeout(300);

const openGarden = async () => {
  await page.locator('.product-row', { hasText: '醒·花园' }).locator('.product-hit').click();
  await page.waitForSelector('dialog.sheet[open]');
  await page.waitForTimeout(250);
};
const sheet = () => page.locator('dialog.sheet[open]');

// 1) 热饮默认：无冰量选择
await openGarden();
const hotIce = await sheet().getByText('冰量', { exact: true }).count();
const hotTemps = await sheet().locator('.options .option').allTextContents();
const hotSelected = await sheet().locator('.option.selected').allTextContents();
assert(hotIce === 0, `热饮无冰量选择 (found ${hotIce})`);
assert(hotTemps.includes('热') && hotTemps.includes('冰'), `温度选项齐全 ${JSON.stringify(hotTemps)}`);
assert(hotSelected.includes('热'), `默认选中热 ${JSON.stringify(hotSelected)}`);
await page.screenshot({ path: '/tmp/qa-shots/35a-hot-modal.png' });

// 2) 切冷饮：出现冰量，默认标准冰
await sheet().getByRole('button', { name: '冰', exact: true }).click();
await page.waitForTimeout(250);
const coldIce = await sheet().getByText('冰量', { exact: true }).count();
const coldChips = await sheet().locator('.options .option').allTextContents();
const coldSelected = await sheet().locator('.option.selected').allTextContents();
assert(coldIce === 1, `冷饮出现冰量选择 (found ${coldIce})`);
assert(['少冰', '标准冰', '去冰'].every((x) => coldChips.includes(x)), `冰量选项 ${JSON.stringify(coldChips)}`);
assert(coldSelected.includes('冰') && coldSelected.includes('标准冰'), `冷饮默认标准冰 ${JSON.stringify(coldSelected)}`);
await page.screenshot({ path: '/tmp/qa-shots/35b-cold-modal.png' });

// 3) 加两杯冰饮（合并为同一条购物袋行 qty=2）
await sheet().getByRole('button', { name: /加入购物袋/ }).click();
await page.waitForTimeout(400);
await openGarden();
await sheet().getByRole('button', { name: '冰', exact: true }).click();
await page.waitForTimeout(200);
await sheet().getByRole('button', { name: /加入购物袋/ }).click();
await page.waitForTimeout(400);

// 4) 再加一杯热饮（独立行，无冰量）
await openGarden();
const againIce = await sheet().getByText('冰量', { exact: true }).count();
assert(againIce === 0, `重新打开默认热饮、无冰量 (found ${againIce})`);
await sheet().getByRole('button', { name: /加入购物袋/ }).click();
await page.waitForTimeout(400);

// 5) 结算页：两行，冰饮行 qty=2 且摘要 冰 · 标准冰；热饮行仅 热
await page.locator('.bag-bar button').click();
await page.waitForTimeout(500);
const items = page.locator('.checkout-item');
assert((await items.count()) === 2, `结算页两条购物袋行 (found ${await items.count()})`);
const coldLine = items.nth(0);
const coldQty = await coldLine.locator('.qty span').textContent();
const coldSummary = await coldLine.locator('.tiny.muted').textContent();
assert(coldQty.trim() === '2', `冰饮合并 qty=2 (found ${coldQty?.trim()})`);
assert(/冰\s*·\s*标准冰/.test(coldSummary || ''), `冰饮摘要 冰 · 标准冰 (${coldSummary?.trim()})`);
const hotSummary = await items.nth(1).locator('.tiny.muted').textContent();
assert((hotSummary || '').includes('热') && !/少冰|标准冰|去冰/.test(hotSummary || ''), `热饮摘要仅温度 (${hotSummary?.trim()})`);
await page.screenshot({ path: '/tmp/qa-shots/35c-checkout.png' });

// 6) 支付 → 门店确认 → 小票逐杯进度（3 杯）
await page.getByRole('button', { name: /模拟微信支付/ }).click();
await page.waitForSelector('dialog.sheet[open]', { timeout: 5000 });
await sheet().getByRole('button', { name: /门店正确，继续支付/ }).click();
await page.waitForSelector('.receipt', { timeout: 10000 });
await page.waitForTimeout(500);
const orderNo = (await page.locator('.order-number').textContent())?.trim() || '';
assert(/[AB]\d{3}/.test(orderNo), `鲜酿单号 ${orderNo}`);
const cups = await page.locator('.cup-row').count();
assert(cups === 3, `小票逐杯 3 杯 (found ${cups})`);
const pending = await page.locator('.cup-row .pill', { hasText: '待制作' }).count();
assert(pending === 3, `3 杯均待制作 (found ${pending})`);
await page.screenshot({ path: '/tmp/qa-shots/35d-receipt.png' });

console.log(results.join('\n'));
console.log('order:', orderNo);
console.log('errors =', errors.length ? errors : 'none');
if (errors.length) process.exitCode = 1;
await browser.close();
