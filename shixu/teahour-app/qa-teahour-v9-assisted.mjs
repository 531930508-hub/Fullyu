// 时叙 V9 补充验收：营业台代点（会员码 / 两种收款码 / 现金找零与校验）、微信适配层接口、360px 窄屏
// 仅本地演示环境；会员与支付均为 mock，不接真实资金与设备。
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = '/tmp/teahour-v9-qa';
fs.mkdirSync(OUT, { recursive: true });

const MP = process.env.MP_URL || 'http://localhost:5174/';
const ADMIN = process.env.ADMIN_URL || 'http://localhost:5173/';
const API = process.env.API_URL || 'http://localhost:8787/api';

const errors = [];
const steps = [];
const log = (msg) => {
  steps.push(msg);
  console.log('✓', msg);
};

// 预期内的失败请求：脚本故意用无效会员码触发 400，用来验证行内报错。
const EXPECTED = [/\/store\/member\/verify/];

function watch(page, label) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const where = msg.location().url || '';
    if (EXPECTED.some((rule) => rule.test(where) || rule.test(msg.text()))) return;
    errors.push(`[${label}] console: ${msg.text()} @ ${where}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
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
  // ---------- 1. 微信适配层接口（mock） ----------
  const login = await fetch(`${API}/customer/wechat/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: `qa-${Date.now()}`, name: 'QA 微信茶客' })
  }).then((res) => res.json());
  if (!login.token || login.provider !== 'mock') throw new Error(`wechat/login 异常：${JSON.stringify(login)}`);
  log(`wx.login 换取会话 · 会员码 ${login.customer.memberCode} · provider=${login.provider}`);

  const phone = await fetch(`${API}/customer/wechat/phone`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ code: 'qa-phone' })
  }).then((res) => res.json());
  if (!/^1\d{10}$/.test(phone.customer?.phone || '')) throw new Error(`手机号授权异常：${JSON.stringify(phone)}`);
  log(`getPhoneNumber 授权写回模拟号码 ${phone.customer.phone}`);

  const order = await fetch(`${API}/customer/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
    body: JSON.stringify({
      storeId: 'sh',
      business: 'fresh',
      type: 'takeaway',
      items: [{ productId: 'xing-0', qty: 1, temp: '热' }]
    })
  }).then((res) => res.json());
  if (!order.order?.id) throw new Error(`下单失败：${JSON.stringify(order)}`);
  const prepay = await fetch(`${API}/customer/orders/${order.order.id}/prepay`, {
    method: 'POST',
    headers: { authorization: `Bearer ${login.token}` }
  }).then((res) => res.json());
  if (!/^prepay_id=/.test(prepay.payment?.package || '') || prepay.mode !== 'mock') {
    throw new Error(`prepay 参数异常：${JSON.stringify(prepay)}`);
  }
  log(`wx.requestPayment 参数可取（${order.order.number} · mode=${prepay.mode}）`);

  // ---------- 2. 营业台代点：会员码 + 收款码两种模式 ----------
  const storeCtx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'zh-CN' });
  const store = await storeCtx.newPage();
  watch(store, 'store');
  await store.goto(`${ADMIN}login`, { waitUntil: 'domcontentloaded' });
  await store.fill('input[autocomplete="username"]', '13800000004');
  await store.fill('input[type="password"]', 'teahour2026');
  await store.locator('button[type="submit"]').click();
  await store.waitForURL('**/store/workbench', { timeout: 20000 });
  await store.locator('.side-link', { hasText: '帮客人点单' }).click();
  await store.waitForSelector('.assisted-item', { timeout: 20000 });
  log('营业台进入帮客人点单');

  await store.locator('.assisted-item').first().click();
  await store.locator('.assisted-line .qty button[aria-label="增加"]').first().click();
  await waitText(store.locator('.pay-total'), /¥/);
  const gross = (await store.locator('.pay-total strong').innerText()).trim();
  log(`代点加入 2 杯 · 应收 ${gross}`);

  // 会员码：无效码行内报错，有效码带入权益
  await store.locator('.pos-member-box button', { hasText: '扫会员码' }).click();
  await store.waitForSelector('.scan-frame.compact', { timeout: 10000 });
  await store.waitForTimeout(400);
  await store.screenshot({ path: `${OUT}/01-store-member-scan.png` });
  await store.locator('input[placeholder="TH-"]').fill('乱码');
  await store.locator('button', { hasText: '识别会员权益' }).click();
  await waitText(store.locator('.modal').first(), /会员码无效/);
  log('无效会员码显示行内错误，不影响继续收款');

  await store.locator('input[placeholder="TH-"]').fill('TH-261029-0001');
  await store.locator('button', { hasText: '识别会员权益' }).click();
  await waitText(store.locator('.pos-member-box'), /已识别/);
  await waitText(store.locator('.cart-panel'), /会员减免/);
  const discounted = (await store.locator('.pay-total strong').innerText()).trim();
  if (discounted === gross) throw new Error(`会员折扣未生效：${gross} → ${discounted}`);
  log(`会员权益带入代点：${gross} → ${discounted}`);
  await store.screenshot({ path: `${OUT}/02-store-member-applied.png` });

  // 堂食需要选位置
  await store.locator('.cart-panel select').first().selectOption({ index: 1 });
  await store.locator('.btn-primary.btn-block', { hasText: '收款' }).click();
  await store.waitForSelector('.pay-mode-toggle', { timeout: 10000 });
  await waitText(store.locator('.qr-demo'), /本单收款码/);
  await store.waitForTimeout(400);
  await store.screenshot({ path: `${OUT}/03-store-pay-qr.png` });
  await store.locator('.pay-mode-toggle button', { hasText: '我们扫顾客的码' }).click();
  await store.waitForSelector('.scan-frame.compact', { timeout: 10000 });
  await store.waitForTimeout(400);
  log('收款弹层两种模式可切换：顾客扫我们的码 / 我们扫顾客的码');
  await store.screenshot({ path: `${OUT}/04-store-pay-scan.png` });

  await store.locator('.modal button', { hasText: '确认收款并下单' }).click();
  await waitText(store.locator('.modal'), /点单成功/, 20000);
  const assistedNumber = (await store.locator('.modal .mono').first().innerText()).trim();
  const assistedTotal = (await waitText(store.locator('.modal'), /¥/)).match(/¥[\d.]+/g);
  if (!/^A\d{3}$/.test(assistedNumber)) throw new Error(`代点单号异常：${assistedNumber}`);
  log(`代点下单成功 ${assistedNumber} · 弹层金额 ${assistedTotal?.[0]}`);
  await store.screenshot({ path: `${OUT}/05-store-assisted-done.png` });
  await store.locator('.modal button', { hasText: '继续点单' }).click();

  // 核对后端落单金额已含会员折扣
  const staffToken = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '13800000004', password: 'teahour2026' })
  })
    .then((res) => res.json())
    .then((data) => data.token);
  const list = await fetch(`${API}/store/orders?storeId=sh&limit=20`, {
    headers: { authorization: `Bearer ${staffToken}` }
  }).then((res) => res.json());
  const landed = (list.orders || []).find((item) => item.number === assistedNumber);
  if (!landed) throw new Error(`后端未找到代点订单 ${assistedNumber}`);
  if (landed.channel !== 'assisted') throw new Error(`代点渠道异常：${landed.channel}`);
  if (landed.items[0].unitPriceCents >= 2000) {
    throw new Error(`会员折扣未写入订单：单价 ${landed.items[0].unitPriceCents}`);
  }
  log(`后端订单含会员折扣：单价 ${(landed.items[0].unitPriceCents / 100).toFixed(2)} 元 · 渠道 ${landed.channel}`);

  // ---------- 3. 现金代点：实收不足被拦，足额出单 ----------
  await store.locator('.assisted-item').first().click();
  await store.locator('.cart-panel select').nth(1).selectOption('cash');
  await store.locator('.cart-panel select').first().selectOption({ index: 1 });
  await store.locator('.btn-primary.btn-block', { hasText: '现金已收' }).click();
  await store.waitForSelector('input[type="number"]', { timeout: 10000 });
  await store.locator('input[type="number"]').fill('1');
  await store.locator('.modal button', { hasText: '确认已收款并出单' }).click();
  await waitText(store.locator('.modal').first(), /实收现金不能少于/);
  log('现金实收不足被拦截');

  await store.locator('input[type="number"]').fill('50');
  await waitText(store.locator('.modal .note'), /应找零/);
  await store.locator('.modal button', { hasText: '确认已收款并出单' }).click();
  await waitText(store.locator('.modal'), /点单成功/, 20000);
  log('现金足额出单并提示找零（不设现金台账）');
  await store.waitForTimeout(400);
  await store.screenshot({ path: `${OUT}/06-store-cash.png` });
  await store.locator('.modal button', { hasText: '继续点单' }).click();

  // ---------- 4. 小程序 360px 窄屏 ----------
  const narrowCtx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    locale: 'zh-CN'
  });
  const narrow = await narrowCtx.newPage();
  watch(narrow, 'mp360');
  await narrow.goto(MP, { waitUntil: 'domcontentloaded' });
  await narrow.waitForSelector('.tea-hero', { timeout: 30000 });
  const overflow = await narrow.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().width > doc.clientWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className || ''}`.slice(0, 60));
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide: wide.slice(0, 5) };
  });
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(`360px 出现横向溢出：${JSON.stringify(overflow)}`);
  }
  log(`小程序 360px 无横向溢出（${overflow.clientWidth}px）`);
  await narrow.screenshot({ path: `${OUT}/07-mp-360-home.png`, fullPage: false });

  await narrow.locator('.nav-bottom uni-button').nth(1).click();
  await narrow.waitForSelector('.product-row .add-btn', { timeout: 15000 });
  await narrow.locator('.product-row .add-btn').first().click();
  await narrow.waitForSelector('.sheet-footer .btn.primary', { timeout: 10000 });
  const sheetOk = await narrow.evaluate(() => {
    const footer = document.querySelector('.sheet-footer .btn.primary');
    if (!footer) return false;
    const rect = footer.getBoundingClientRect();
    return rect.width > 80 && rect.bottom <= window.innerHeight + 1 && rect.left >= -1;
  });
  if (!sheetOk) throw new Error('360px 下商品弹层主按钮不可用或超出视口');
  log('小程序 360px 商品弹层主按钮完整可点');
  await narrow.screenshot({ path: `${OUT}/08-mp-360-sheet.png` });

  if (errors.length) throw new Error(`控制台存在错误：\n${errors.join('\n')}`);
  console.log(`\n全部通过：${steps.length} 项检查，截图目录 ${OUT}`);
} catch (err) {
  console.error('\n验收失败：', err.message);
  if (errors.length) console.error(errors.map((e) => ` - ${e}`).join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
