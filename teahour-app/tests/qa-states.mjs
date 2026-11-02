/*
 * qa-states.mjs —— 对照「在场」小程序测试标准的时叙状态/边界测试
 * 覆盖：全页面错误态、空态、弹层键盘行为、失败保留输入、无效操作禁用、
 *       多宽度响应式无横向溢出、坏图检查、axe 无障碍、中英双语冷启动恢复。
 * 运行前：npm run build && npm start（默认 http://localhost:8787）
 * 用法：node tests/qa-states.mjs   （QA_BASE 可改端口）
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs';

const BASE = process.env.QA_BASE || 'http://localhost:8787';
const SHOT = '/tmp/qa-states';
fs.mkdirSync(SHOT, { recursive: true });

const results = [];
const assert = (ok, label, extra = '') => {
  results.push({ ok: !!ok, label, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const runtimeErrors = [];
  const badResponses = [];
  page.on('response', (res) => { if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`); });
  runtimeErrors.badResponses = badResponses;
  page.on('pageerror', (e) => runtimeErrors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') runtimeErrors.push(m.text()); });
  return { context, page, runtimeErrors };
}

const noOverflow = async (page, label) => {
  const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  assert(over <= 2, `${label} 无横向溢出`, over > 2 ? `溢出 ${over}px` : '');
};

const brokenImages = async (page, label) => {
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && !i.naturalWidth).length);
  assert(broken === 0, `${label} 无坏图`, broken ? `${broken} 张` : '');
};

const inlineErrorVisible = async (page) =>
  page.locator('.inline-error[role=alert]').first().isVisible().catch(() => false);

async function axeCheck(page, label) {
  try {
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    assert(serious.length === 0, `${label} axe 无严重违规`, serious.map((v) => v.id).join(',') || '');
    if (serious.length) console.log(JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2));
  } catch (error) {
    assert(false, `${label} axe 扫描完成`, String(error.message || error));
  }
}

async function staffLogin(page, username) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[inputmode="numeric"]').fill(username);
  await page.locator('input[type="password"]').fill('teahour2026');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(admin|store)\//, { timeout: 10000 });
}

/* ============ A. 顾客端 ============ */
{
  const { context, page, runtimeErrors } = await newPage({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.mini-header', { timeout: 10000 });
  assert(await page.locator('.mini-logo').isVisible(), '顾客端首页加载（中文）');
  await noOverflow(page, '顾客端首页 390');
  await brokenImages(page, '顾客端首页');
  assert(runtimeErrors.length === 0, '顾客端首页无运行时错误', runtimeErrors.join(' | '));

  // 双语切换 + 冷启动恢复
  await page.locator('.language-switch').click();
  await page.waitForTimeout(300);
  const enSrc = await page.locator('.mini-logo').getAttribute('src');
  assert(enSrc.includes('logo-en'), '切英文后使用英文 logo', enSrc);
  const enText = await page.locator('.phone-content').innerText();
  assert(/Menu|Tea|Order/i.test(enText), '切英文后出现英文文案');
  await noOverflow(page, '顾客端英文首页 390');
  await page.reload({ waitUntil: 'networkidle' });
  assert((await page.locator('.mini-logo').getAttribute('src')).includes('logo-en'), '英文状态冷启动恢复');
  await axeCheck(page, '顾客端首页(EN)');
  await page.locator('.language-switch').click();
  await page.waitForTimeout(200);

  // 空态：订单列表（新顾客会话无订单）
  const customerToken = await page.evaluate(() => localStorage.getItem('teahour.customer.token'));
  if (customerToken) {
    await page.locator('.nav-bottom button', { hasText: '订单' }).first().click();
    await page.waitForSelector('.empty, .order-card', { timeout: 8000 });
    assert(await page.locator('.empty').isVisible(), '新顾客订单列表空态');
  }

  // 弹层：茶单商品 sheet + Escape
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.locator('.nav-bottom button', { hasText: '茶单' }).first().click();
  try {
    await page.waitForSelector('.product-hit', { timeout: 8000 });
  } catch (error) {
    await page.screenshot({ path: '/tmp/qa-states/menu-fail.png' });
    console.log('MENU FAIL body:', (await page.locator('.phone-content').innerText()).slice(0, 300));
    console.log('MENU FAIL url:', page.url(), 'navs:', JSON.stringify(await page.locator('.nav-bottom button').allInnerTexts()));
    throw error;
  }
  await axeCheck(page, '顾客端茶单(ZH)');
  await page.locator('.product-hit').first().click();
  await page.waitForSelector('dialog.sheet', { timeout: 5000 });
  assert(true, '商品弹层打开');
  // 原生 dialog：Escape 由浏览器原生支持，Tab 被圈定在弹层内
  await page.keyboard.press('Tab');
  const focusInSheet = await page.evaluate(() => !!document.activeElement?.closest('dialog'));
  assert(focusInSheet, '商品弹层 Tab 焦点留在弹层内');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const dialogGone = (await page.locator('dialog').count()) === 0;
  assert(dialogGone, '商品弹层 Escape 关闭');

  // 失败保留输入：错误会员码提示后茶篮内容不受影响（重开 sheet 仍可选）
  // 无效操作：错误态全页
  await context.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '本地测试：模拟网络异常' }) }));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const offlineText = await page.locator('.phone-content').innerText();
  assert(/暂时连不上茶席|The tea counter is offline/.test(offlineText) && (await page.locator('button', { hasText: /重新连接|Try again/ }).count()) > 0, '顾客端首页 API 错误显示离线错误态与重试');
  assert(runtimeErrors.filter((e) => !/503|模拟网络异常/.test(e)).length === 0, '顾客端错误态无未处理异常', runtimeErrors.join(' | '));

  // 响应式
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await context.unroute('**/api/**');
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.mini-header');
    await noOverflow(page, `顾客端首页 ${width}`);
    await page.locator('.nav-bottom button', { hasText: '茶单' }).first().click();
    await page.waitForSelector('.product-hit');
    await noOverflow(page, `顾客端茶单 ${width}`);
  }
  await context.close();
}

/* ============ B. 营业台 ============ */
{
  const { context, page, runtimeErrors } = await newPage({ width: 1280, height: 900 });
  await staffLogin(page, '13800000004'); // 苏禾 · 门店店长（上海·城市中心店）
  await page.waitForSelector('.ops-main', { timeout: 10000 });
  assert(page.url().includes('/store/'), '店长登录进入营业台');
  await noOverflow(page, '营业台 1280');
  await brokenImages(page, '营业台');

  // 无效操作：非法杯贴码 → 错误提示
  await page.locator('.scan-banner input').fill('XXXX-999');
  await page.locator('.scan-banner').locator('button[type=submit], .btn').first().click().catch(() => page.keyboard.press('Enter'));
  await page.waitForTimeout(500);
  const scanText = await page.locator('.scan-banner').innerText();
  assert(/不存在|未找到|无效|无法|错误|失败/.test(scanText), '非法杯贴码给出错误提示', scanText.slice(0, 60));

  // 错误态：8 个门店页面（SPA 内导航，避免整页重载触发重新鉴权）
  await context.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '本地测试：模拟网络异常' }) }));
  const storeLinks = await page.locator('.sidebar-nav button.side-link').allInnerTexts();
  const rotatedStore = [...storeLinks.slice(1), storeLinks[0]];
  for (const label of rotatedStore) {
    await page.locator('.sidebar-nav button.side-link', { hasText: label.trim() }).first().click();
    await page.waitForTimeout(700);
    const ok = await inlineErrorVisible(page);
    assert(ok, `营业台「${label.trim()}」API 错误显示内联错误`);
    await page.screenshot({ path: `${SHOT}/store-${label.trim()}-error.png` });
  }
  // 整页重载 + API 故障 → 会话校验失败回到登录页（记录该行为）
  await page.goto(`${BASE}/store/workbench`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  assert(page.url().includes('/login'), '整页重载且服务故障时回到登录页（会话保护）');
  const unexpectedConsole = runtimeErrors.filter((e) => !/Failed to load resource|503|模拟网络异常/.test(e));
  const unexpectedResponses = (runtimeErrors.badResponses || []).filter((r) => !/503|404 .*\/api\/store\/scan/.test(r));
  assert(unexpectedConsole.length === 0 && unexpectedResponses.length === 0, '营业台错误态无未处理异常', [...unexpectedConsole, ...unexpectedResponses].join(' | '));

  // 响应式 1024
  await context.unroute('**/api/**');
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(`${BASE}/store/workbench`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ops-main');
  await noOverflow(page, '营业台 1024');
  await axeCheck(page, '营业台工作台');
  await context.close();
}

/* ============ C. 总部后台 ============ */
{
  const { context, page, runtimeErrors } = await newPage({ width: 1440, height: 900 });
  await staffLogin(page, '13800000001'); // 林知秋 · 超级管理员
  await page.waitForSelector('.ops-main', { timeout: 10000 });
  assert(page.url().includes('/admin/'), '超管登录进入后台');
  await noOverflow(page, '后台 1440');
  await brokenImages(page, '后台首页');

  // 错误态：12 个后台页面
  await context.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '本地测试：模拟网络异常' }) }));
  const adminLinks = await page.locator('.sidebar-nav button.side-link').allInnerTexts();
  const rotatedAdmin = [...adminLinks.slice(1), adminLinks[0]];
  for (const label of rotatedAdmin) {
    await page.locator('.sidebar-nav button.side-link', { hasText: label.trim() }).first().click();
    await page.waitForTimeout(700);
    assert(await inlineErrorVisible(page), `后台「${label.trim()}」API 错误显示内联错误`);
    await page.screenshot({ path: `${SHOT}/admin-${label.trim()}-error.png` });
  }
  assert(runtimeErrors.filter((e) => !/503|模拟网络异常/.test(e)).length === 0, '后台错误态无未处理异常', runtimeErrors.join(' | '));
  await context.unroute('**/api/**');

  // 费用录入弹层：Escape 关闭
  await page.goto(`${BASE}/admin/expenses`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ops-main');
  await axeCheck(page, '后台运营费用页');
  const entryBtn = page.locator('button', { hasText: '录入' }).first();
  await entryBtn.click();
  await page.waitForSelector('[role=dialog]', { timeout: 5000 });
  assert(true, '费用录入弹层打开');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert((await page.locator('[role=dialog]').count()) === 0, '费用录入弹层 Escape 关闭');

  // 失败保留输入：录入提交 503 → 表单内容保留 + 错误提示
  await entryBtn.click();
  await page.waitForSelector('[role=dialog]');
  await context.route('**/api/admin/expenses', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '本地测试：保存失败' }) }));
  const dialog = page.locator('[role=dialog]');
  const storeSelect = dialog.locator('select').first();
  await storeSelect.selectOption({ index: 1 });
  await dialog.locator('input[type=date]').fill('2026-10-28');
  const amountInput = dialog.locator('input[inputmode=decimal]');
  await amountInput.fill('123.45');
  await dialog.locator('button[type=submit], .btn-primary, button', { hasText: /保存|确定|提交/ }).last().click();
  await page.waitForTimeout(600);
  const retained = await dialog.locator('input[inputmode=decimal]').inputValue();
  const errorShown = (await dialog.locator('.field-error, .inline-error').count()) > 0 || (await dialog.innerText()).includes('保存失败');
  assert(errorShown, '费用保存失败显示错误');
  assert(retained === '123.45', '费用保存失败保留已填金额', retained);
  await page.screenshot({ path: `${SHOT}/admin-expense-failure-retains.png` });
  await page.keyboard.press('Escape').catch(() => {});
  await context.unroute('**/api/admin/expenses').catch(() => {});

  // 批量导入：错误 CSV 行级报错且文本保留
  const importBtn = page.locator('button', { hasText: '批量导入' }).first();
  if (await importBtn.count()) {
    await importBtn.click();
    await page.waitForSelector('[role=dialog]', { timeout: 5000 });
    const importDialog = page.locator('[role=dialog]');
    const textarea = importDialog.locator('textarea').first();
    await textarea.fill('日期,门店,类别,金额,备注\nbad-date,静安,人力,100,x');
    await importDialog.locator('button', { hasText: /预览|校验/ }).first().click();
    await page.waitForTimeout(800);
    const importText = await importDialog.innerText();
    assert(/问题|错误|无法/.test(importText), '导入预览报出错误行');
    assert((await textarea.inputValue()).includes('bad-date'), '导入校验失败后文本保留');
    await page.screenshot({ path: `${SHOT}/admin-import-errors.png` });
    await page.keyboard.press('Escape').catch(() => {});
  }

  // axe + 响应式
  await axeCheck(page, '后台经营概览');
  for (const width of [1024, 1366]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`${BASE}/admin/overview`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.ops-main');
    await noOverflow(page, `后台概览 ${width}`);
  }
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n===== qa-states: ${results.length - failed.length}/${results.length} 通过 =====`);
fs.writeFileSync('/tmp/qa-states-results.json', JSON.stringify(results, null, 2));
if (failed.length) console.log('FAILURES:\n' + failed.map((f) => `- ${f.label} ${f.extra}`).join('\n'));
