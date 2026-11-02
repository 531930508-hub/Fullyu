import { chromium } from '@playwright/test';

const base = 'http://localhost:8787';
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];

async function watch(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${label}] console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
}

// Desktop customer
const desktop = await browser.newContext({ viewport: { width: 1366, height: 1000 }, locale: 'zh-CN' });
const page = await desktop.newPage();
await watch(page, 'desktop');
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForSelector('.tea-hero', { timeout: 20000 });
await page.screenshot({ path: '/tmp/parity-home-zh.png' });

await page.click('.language-switch');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/parity-home-en.png' });
await page.click('.language-switch');
await page.waitForTimeout(300);

// store sheet
await page.click('.store-trigger');
await page.waitForSelector('dialog.sheet[open]');
await page.screenshot({ path: '/tmp/parity-store-sheet.png' });
await page.click('dialog.sheet .store-option:nth-child(2) .btn');
await page.waitForTimeout(600);

// table sheet
await page.click('.location-bar .text-btn');
await page.waitForSelector('dialog.sheet[open]');
await page.screenshot({ path: '/tmp/parity-table-sheet.png' });
await page.click('dialog.sheet .sheet-head .icon-btn');
await page.waitForTimeout(300);

// menu
await page.locator('.nav-bottom button').nth(1).click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/parity-menu.png' });

// product sheet
await page.locator('.product-row .add-btn').first().click();
await page.waitForSelector('dialog.sheet[open]');
await page.screenshot({ path: '/tmp/parity-product-sheet.png' });
await page.locator('dialog.sheet .sheet-footer .btn.primary').click();
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/parity-bag.png' });

// checkout
await page.locator('.bag-bar button').click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/parity-checkout.png', fullPage: false });
await page.locator('.phone-content').evaluate((el) => (el.scrollTop = el.scrollHeight));
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/parity-checkout-bottom.png' });

// profile
await page.locator('.nav-bottom button').nth(4).click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/parity-profile.png' });

// member sheet
await page.click('.qr-shortcut');
await page.waitForSelector('dialog.sheet[open]');
await page.screenshot({ path: '/tmp/parity-member.png' });
await page.locator('dialog.sheet .sheet-head .icon-btn').click();
await page.waitForTimeout(300);

// Mobile customer
const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', isMobile: true, hasTouch: true });
const mobile = await mobileCtx.newPage();
await watch(mobile, 'mobile');
await mobile.goto(base + '/', { waitUntil: 'networkidle' });
await mobile.waitForSelector('.tea-hero', { timeout: 20000 });
await mobile.screenshot({ path: '/tmp/parity-mobile-home.png' });
await mobile.locator('.nav-bottom button').nth(2).click();
await mobile.waitForTimeout(400);
await mobile.screenshot({ path: '/tmp/parity-mobile-retail.png' });

// Staff login
const staffCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
const staff = await staffCtx.newPage();
await watch(staff, 'staff');
await staff.goto(base + '/login', { waitUntil: 'networkidle' });
await staff.fill('input[inputmode="numeric"]', '13800000001');
await staff.fill('input[type="password"]', 'teahour2026');
await staff.click('button[type="submit"]');
await staff.waitForURL(/\/admin\//, { timeout: 20000 });
await staff.waitForTimeout(1200);
await staff.screenshot({ path: '/tmp/parity-admin-overview.png' });

await staff.goto(base + '/store/workbench', { waitUntil: 'networkidle' });
await staff.waitForTimeout(1200);
await staff.screenshot({ path: '/tmp/parity-store-workbench.png' });

await staff.goto(base + '/admin/expenses', { waitUntil: 'networkidle' });
await staff.waitForTimeout(1200);
await staff.screenshot({ path: '/tmp/parity-admin-expenses.png' });

await staff.setViewportSize({ width: 900, height: 900 });
await staff.waitForTimeout(500);
await staff.screenshot({ path: '/tmp/parity-admin-900.png' });

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
