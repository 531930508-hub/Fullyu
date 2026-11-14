/**
 * 芯烨条码云（XP-420B）直连试用脚本。
 *
 * 用途：部署前用真实账号/SN 验证「云端能打到这台机器」，不改业务数据、不走订单。
 *
 * 用法（仓库根目录）：
 *   XPYUN_USER=xxx XPYUN_UKEY=xxx XPYUN_SN=xxx \
 *     pnpm --filter @teahour/server exec tsx ../../scripts/xpyun-trial.ts --status
 *   ... --calibration   # 自检标：8 档字体 + 对齐基线 + 二维码，用来量版式
 *   ... （不带参数）     # 样例杯贴
 *
 * 每一步都打印云端原始返回，并用 queryOrderState 回查是否真的出纸 ——
 * 「云端受理」不等于「出纸」，这里不替打印机说好话。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  XpyunLabelPrinter,
  buildXpyunCalibration,
  type CupLabelPayload
} from '../packages/integrations/src/index';

/**
 * 凭证优先取进程环境；缺了再读 apps/server/.env —— 试用时只需把 XPYUN_* 填进 .env，
 * 不必在命令行里留下密钥（shell history 也是日志）。
 */
const loadEnvFile = (): Record<string, string> => {
  const file = resolve(__dirname, '../apps/server/.env');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return out;
};

const fileEnv = loadEnvFile();
const env: NodeJS.ProcessEnv = { ...fileEnv, ...process.env };
const args = new Set(process.argv.slice(2));

const USAGE = [
  '用法：把 XPYUN_USER / XPYUN_UKEY / XPYUN_SN 填进 apps/server/.env（或命令行环境变量），然后：',
  '  pnpm --filter @teahour/server exec tsx ../../scripts/xpyun-trial.ts [--status|--calibration]'
].join('\n');

let printer: XpyunLabelPrinter;
try {
  printer = new XpyunLabelPrinter({
    user: env.XPYUN_USER,
    ukey: env.XPYUN_UKEY,
    sn: env.XPYUN_SN,
    apiBase: env.XPYUN_API_BASE,
    labelWidthMm: Number(env.XPYUN_LABEL_WIDTH_MM) || undefined,
    labelHeightMm: Number(env.XPYUN_LABEL_HEIGHT_MM) || undefined,
    gapMm: env.XPYUN_LABEL_GAP_MM === undefined ? undefined : Number(env.XPYUN_LABEL_GAP_MM)
  });
} catch (error) {
  console.error((error as Error).message);
  console.error(USAGE);
  process.exit(1);
}

const now = new Date().toISOString();
const sample: CupLabelPayload = {
  label: 'A023-1',
  pickupCode: 'A023',
  orderNumber: 'S260111000023',
  storeName: '西岸店',
  productName: '醒·花园蜜香',
  series: 'xing',
  seriesName: '醒',
  temp: '热',
  ice: null,
  cupIndex: 1,
  cupTotal: 2,
  printedAt: now,
  orderedAt: now,
  customerName: '茶客',
  storePhone: undefined
};

/** 回查 10 次（每次 2s）：云端「已受理」之后，纸真的出来了才算完。 */
async function waitPrinted(orderId: string | undefined, what: string): Promise<void> {
  if (!orderId) {
    console.warn(`[${what}] 云端没返回订单编号，无法回查，请到机器前确认。`);
    return;
  }
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const printed = await printer.orderPrinted(orderId);
    console.log(`[${what}] queryOrderState(${orderId}) → ${printed}`);
    if (printed === true) return;
  }
  console.warn(`[${what}] 10 次回查仍未确认出纸，请到机器前看纸。`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  console.log(`接口：${env.XPYUN_API_BASE || 'https://open-barcode.xpyun.net/api/openapi（默认）'}`);

  // 新机第一步：注册 SN。文档要求「打印之前必须调用本接口」，没注册就只会拿到 1002。
  if (args.has('--register')) {
    const result = await printer.register(env.XPYUN_NAME || '时叙杯贴');
    console.log('verifyPrinter →', result);
    if (!result.ok) process.exitCode = 1;
  }

  const status = await printer.status();
  console.log('状态 →', status);
  if (args.has('--status')) return;
  if (!status.online && !args.has('--force')) {
    // --force 只跳过本脚本的预检；驱动里还有一道状态闸，缺纸/离线仍会拒发，
    // 因为云端那时照收不误，任务只会堆在机器队列里（现场实测积过 7 张）。
    console.error('打印机不在线：先查纸、盖、网络与 SN。--force 也绕不过驱动里的状态闸。');
    process.exitCode = 1;
    return;
  }

  if (args.has('--calibration')) {
    const content = buildXpyunCalibration(printer.labelStyle);
    console.log('自检标 XML：\n' + content);
    const sent = await printer.printContent(content, 'sh');
    console.log('[自检标] printContent →', sent);
    if (!sent.ok) process.exitCode = 1;
    await waitPrinted(sent.orderId, '自检标');
    return;
  }

  const result = await printer.print({
    orderId: 'trial',
    orderNumber: 'TRIAL',
    storeId: 'sh',
    reprint: true,
    labels: [sample]
  });
  console.log('[样例杯贴] print →', result);
  if (!result.ok) {
    process.exitCode = 1;
    return;
  }
  await waitPrinted(result.providerRef, '样例杯贴');
}

main().catch((error) => {
  console.error('试用失败：', error);
  process.exitCode = 1;
});