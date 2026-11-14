import { createHash } from 'node:crypto';
import type {
  CupLabelPayload,
  DeviceStatus,
  LabelPrinter,
  PrintJobPayload,
  PrintResult
} from '../../contracts';
import {
  formatLabelTime,
  measureDots,
  optionLine,
  pickupCodeOf,
  splitProductName,
  truncateUnits
} from '../../label/tspl';

/**
 * 芯烨条码云（XP-420B 走「条码云」平台，不是「票据云」）标签直推。
 *
 * 与飞鹅的差别，也是选它的理由：
 * - 同一台 XP-420B，不用在门店放一台常开的电脑跑打印代理，服务端直接推；
 * - 机器掉线时 printLabel 用 mode=0 直接回 1003，不会假入库、假成功；
 * - 下发后还有 queryOrderState 可以回查「真的出纸了没有」。
 *
 * 协议是 XML 标签而不是字节流：坐标单位 mm（1mm = 8dot），
 * 所以这里把 TSPL 那套「设计稿 dots」除以 8 平移过来，版式常量与 tspl.ts 一一对应。
 * 代价是云端只开放 TEXT/BARC/QRC/SQ/BL/BMP 这几种图元，没有字距参数，
 * 字距（tracking）这一层设计在云通道上做不到，靠字号与留白找齐。
 */

/** 条码云开放平台（sprinter 命名空间）。注意不是票据云的 open.xpyun.net。 */
const DEFAULT_API_BASE = 'https://open-barcode.xpyun.net/api/openapi';

const PRINT_LABEL_PATH = '/sprinter/printLabel';
const PRINTER_STATUS_PATH = '/sprinter/queryPrinterStatus';
const ORDER_STATE_PATH = '/sprinter/queryOrderState';
const VERIFY_PRINTER_PATH = '/sprinter/verifyPrinter';

/** 单次 content 的建议上限（文档：超过 65,535 字符应改用非透传/拆分）。 */
const MAX_CONTENT_CHARS = 60_000;

/**
 * XML 声明头：云端并不强制（不带也能过），但标准解析器认它，留着更稳。
 * 真正会被判 -2 的不是声明头，是坐标写成小数 —— 见 intMm。
 */
const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';

export type XpyunLabelStyle = {
  widthMm: number;
  heightMm: number;
  /** 标签间隙（mm）。间隙纸常见 2mm。 */
  gapMm: number;
  /** 时间按门店当地时间出。 */
  timeZone: string;
};

export const DEFAULT_XPYUN_LABEL_STYLE: XpyunLabelStyle = {
  widthMm: 40,
  heightMm: 60,
  gapMm: 2,
  timeZone: 'Asia/Shanghai'
};

/**
 * 版式常量（mm）。由 tspl.ts 的 CUP_LABEL_LAYOUT（dots）除以 8 并取整得到。
 *
 * **云端坐标只吃整数 mm**：`x="2.5"`、`x="2.0"` 实测都回 -2 REQUEST_PARAM_INVALID，
 * 只有 BL 的 w/h 允许小数。所以 40×60 的版面按 1mm 网格重排，改设计时也只能落在整毫米上。
 */
export const XPYUN_CUP_LAYOUT = {
  widthMm: 40,
  heightMm: 60,
  /** 左右安全边距 3mm（原设计 2.5mm 落不到整数网格上）。 */
  marginX: 3,
  /** 右对齐基线 37mm，与左边距对称。 */
  rightX: 37,
  /** 水平居中基线 20mm（条码云 center 对齐要求 x = 标签宽度一半）。 */
  centerX: 20,
  brandY: 3,
  cupSeqY: 3,
  rule1Y: 7,
  eyebrowY: 8,
  heroY: 12,
  customerY: 14,
  rule2Y: 22,
  seriesY: 23,
  /** 英文系列名右移 2mm、基线降 1mm（落在整毫米上）。 */
  seriesEnDx: 2,
  seriesEnDy: 1,
  productY: 27,
  optionY: 32,
  rule3Y: 36,
  qrY: 37,
  storeY: 51,
  telY: 55,
  /** 横线：宽度随标签收窄，线宽 0.25mm（BL 的 w/h 是唯一接受小数的坐标）。 */
  ruleWidthMm: 34,
  ruleThicknessMm: 0.25,
  /** 二维码：21 模块 × 5dot 模块 ≈ 13.1mm，与设计稿 105dot 等宽。 */
  qrModules: 21,
  qrModuleDots: 5,
  qrEcc: 'M'
} as const;

/**
 * 条码云字号：
 * - f=7 中文点阵（24×24dot ≈ 3mm），f=8 是更小一档；
 * - f=1..6 是英数字体，这里按 TSPL 内建字体的宽高假设 1:8×12 2:12×20 3:16×24 5:32×48。
 */
const FONT_CN = 7;
const FONT_SMALL = 2;
const FONT_MID = 3;
const FONT_HERO = 5;

/** 品牌顺序：醒 → 松 → 庆 → 眠；标签上只出英文，中文系列字留在品名里。 */
const SERIES_EN: Record<string, string> = {
  xing: 'GOOD DAY',
  song: 'CHILL',
  qing: 'CHEERS',
  mian: 'GOOD NIGHT'
};

/** XML 里 < & > 与引号必须转义，否则茶名里一个 & 就能让整张标签解析失败。 */
export function xpyunText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .trim();
}

/**
 * mm 的两种写法，别混：
 * - 坐标（TEXT/SQ/QRC/BL 的 x、y）必须是整数，带小数点连 "2.0" 都会被判参数不合法；
 * - 只有 BL 的 w/h 允许小数（细线靠它）。
 */
const intMm = (value: number): string => String(Math.round(value));
const fracMm = (value: number): string => String(Math.round(value * 100) / 100);

type TextOpts = {
  f?: number;
  xw?: number;
  yh?: number;
  a?: 'left' | 'center' | 'right';
  /** 双打加粗：同字右移 1dot（0.125mm）再打一遍。 */
  bold?: boolean;
};

/** 一行文本；内容先过 xpyunText，坐标取整毫米。 */
function textTag(x: number, y: number, content: string, opts: TextOpts = {}): string[] {
  const value = xpyunText(content);
  if (!value) return [];
  const attrs = [`y="${intMm(y)}"`, `f="${opts.f ?? FONT_CN}"`];
  if (opts.xw && opts.xw !== 1) attrs.push(`xw="${opts.xw}"`);
  if (opts.yh && opts.yh !== 1) attrs.push(`yh="${opts.yh}"`);
  if (opts.a) attrs.push(`a="${opts.a}"`);
  const tag = (offset: number) => `<TEXT x="${intMm(x + offset)}" ${attrs.join(' ')}>${value}</TEXT>`;
  return opts.bold ? [tag(0), tag(0.125)] : [tag(0)];
}

/** 横线：w > h 即横向线条；坐标取整、线宽走小数。 */
const ruleTag = (y: number, style: XpyunLabelStyle): string =>
  `<BL x="${intMm(XPYUN_CUP_LAYOUT.marginX)}" y="${intMm(y)}" w="${fracMm(
    Math.min(XPYUN_CUP_LAYOUT.ruleWidthMm, style.widthMm - XPYUN_CUP_LAYOUT.marginX * 2)
  )}" h="${fracMm(XPYUN_CUP_LAYOUT.ruleThicknessMm)}"/>`;

/**
 * 按「假设字宽」截断到 mm 预算：中文 24dot、ASCII 12dot。
 * 云端没有字距参数，截断预算里也就不含字距——宁可多留一点，也不要压到二维码。
 */
export function fitMm(text: string, maxMm: number): string {
  const budgetDots = Math.round(maxMm * 8);
  if (measureDots(text, 24, 12) <= budgetDots) return text;
  const chars = Array.from(text);
  let out = '';
  let width = 0;
  for (const char of chars) {
    const w = measureDots(char, 24, 12);
    if (width + w + 24 > budgetDots) break;
    out += char;
    width += w;
  }
  return `${out.trimEnd()}…`;
}

/**
 * 一张杯贴的完整标签 XML（PAGE + 单个 LABEL）。
 *
 * 顺序与 TSPL 版一致：品牌 → 取餐号 → 系列/品名 → 规格与时间 → 二维码 → 门店/电话。
 * 单号不上杯贴；称呼最多 3 个字格，绝不印手机号。
 */
export function buildXpyunCupLabel(
  label: CupLabelPayload,
  style: XpyunLabelStyle = DEFAULT_XPYUN_LABEL_STYLE
): string {
  const l = XPYUN_CUP_LAYOUT;
  const parts: string[] = [];

  // ① 品牌 + 杯序（右）
  parts.push(...textTag(l.marginX, l.brandY, 'Full愈·时叙', { f: FONT_CN }));
  parts.push(
    ...textTag(l.rightX, l.cupSeqY, `${label.cupIndex} / ${label.cupTotal}`, {
      f: FONT_SMALL,
      a: 'right'
    })
  );

  // ② 横线 + 取餐号眉题
  parts.push(ruleTag(l.rule1Y, style));
  parts.push(...textTag(l.marginX, l.eyebrowY, '取餐号', { f: FONT_CN }));

  // ③ 取餐号（主角）+ 称呼（右，3 个字格）
  parts.push(...textTag(l.marginX, l.heroY, pickupCodeOf(label), { f: FONT_HERO }));
  const customer = fitMm(truncateUnits(String(label.customerName ?? '').trim() || '茶客', 3), 15);
  parts.push(...textTag(l.rightX, l.customerY, customer, { f: FONT_CN, a: 'right' }));

  // ④ 系列：中文系列字 3mm，英文系列名 2mm 跟在后面
  parts.push(ruleTag(l.rule2Y, style));
  const { seriesCn, teaName } = splitProductName(label.productName);
  const seriesCnText = String(label.seriesName ?? '').trim() || seriesCn;
  const seriesEn = label.series ? SERIES_EN[label.series] || '' : '';
  if (seriesCnText) {
    parts.push(...textTag(l.marginX, l.seriesY, seriesCnText, { f: FONT_CN }));
    if (seriesEn) {
      const enX = l.marginX + (measureDots(seriesCnText, 24, 12) / 8) + l.seriesEnDx;
      parts.push(...textTag(enX, l.seriesY + l.seriesEnDy, seriesEn, { f: FONT_MID }));
    }
  }

  // ⑤ 品名（唯一的加粗项）
  parts.push(
    ...textTag(l.marginX, l.productY, fitMm(teaName || label.productName, l.ruleWidthMm), {
      f: FONT_CN,
      bold: true
    })
  );

  // ⑥ 温度·冰量（左）+ 下单时间（右）
  const options = fitMm(optionLine(label.temp, label.ice), 17.5);
  parts.push(...textTag(l.marginX, l.optionY, options, { f: FONT_CN }));
  const when = formatLabelTime(label.orderedAt || label.printedAt, style.timeZone);
  parts.push(...textTag(l.rightX, l.optionY, when, { f: FONT_SMALL, a: 'right' }));

  // ⑦ 出餐二维码：码值是杯贴码，不是取餐号
  parts.push(ruleTag(l.rule3Y, style));
  const qrWidthMm = (l.qrModules * l.qrModuleDots) / 8;
  const qrX = (style.widthMm - qrWidthMm) / 2;
  // 条码云混用两套单位：坐标 x/y 是 mm，码的线宽 s（模块点数）与 BARC 的 h 仍是 dot。
  parts.push(
    `<QRC x="${intMm(qrX)}" y="${intMm(l.qrY)}" s="${l.qrModuleDots}" e="${l.qrEcc}">${xpyunText(label.label)}</QRC>`
  );

  // ⑧ 门店 ⑨ 电话（都居中）
  parts.push(
    ...textTag(l.centerX, l.storeY, fitMm(String(label.storeName ?? ''), l.ruleWidthMm), {
      f: FONT_CN,
      a: 'center'
    })
  );
  parts.push(...textTag(l.centerX, l.telY, String(label.storePhone ?? ''), { f: FONT_SMALL, a: 'center' }));

  return [
    XML_DECL,
    `<PAGE w="${intMm(style.widthMm)}" l="${intMm(style.heightMm)}" ld="${intMm(style.gapMm)}" pt="1">`,
    '<LABEL id="1">',
    ...parts,
    '</LABEL>',
    '</PAGE>'
  ].join('');
}

/**
 * 自检标：给现场调纸用的一张标尺。
 *
 * 云端字号、右对齐基线、二维码模块大小、页面缩放都只能靠实拍确认：
 * 边框就是 40×60 的 1:1 标尺（量它就知道有没有缩放），
 * x=20 / x=37 两条竖线是居中与右对齐的真实基线，
 * 8 档字体按高度从矮到高排，避免互相压字。
 */
export function buildXpyunCalibration(style: XpyunLabelStyle = DEFAULT_XPYUN_LABEL_STYLE): string {
  const w = Math.round(style.widthMm);
  const h = Math.round(style.heightMm);
  const l = XPYUN_CUP_LAYOUT;
  const parts: string[] = [
    // 1:1 标尺：边框内沿正好 40×60mm
    `<SQ x="0" y="0" xe="${w}" ye="${h}" lt="4"/>`,
    `<BL x="${l.centerX}" y="0" w="0.25" h="${h}"/>`,
    `<BL x="${l.rightX}" y="0" w="0.25" h="${h}"/>`,
    `<BL x="${l.marginX}" y="45" w="${l.ruleWidthMm}" h="0.25"/>`
  ];

  parts.push(...textTag(l.marginX, 1, `自检 ${w}×${h}`, { f: FONT_CN }));

  // 按字高排：f1 最小 → f5 最大，行间距跟着字高走，避免上一行压住下一行
  const rows: Array<[number, number]> = [
    [1, 6],
    [2, 9],
    [6, 13],
    [3, 16],
    [7, 20],
    [8, 24],
    [4, 29],
    [5, 34]
  ];
  for (const [f, y] of rows) {
    parts.push(...textTag(l.marginX, y, `F${f} Aa0 取`, { f }));
  }

  parts.push(...textTag(l.rightX, 41, '右→', { f: FONT_CN, a: 'right' }));
  parts.push(...textTag(l.centerX, 41, '中 A1', { f: FONT_CN, a: 'center' }));
  parts.push(...textTag(l.marginX, 47, 'QRC s=5', { f: FONT_SMALL }));

  const qrMm = (l.qrModules * l.qrModuleDots) / 8;
  parts.push(
    `<QRC x="${Math.round((w - qrMm) / 2)}" y="47" s="${l.qrModuleDots}" e="${l.qrEcc}">A001-1</QRC>`
  );

  return [
    XML_DECL,
    `<PAGE w="${w}" l="${h}" ld="${intMm(style.gapMm)}" pt="1">`,
    '<LABEL id="1">',
    ...parts,
    '</LABEL>',
    '</PAGE>'
  ].join('');
}

/** 云端返回码 → 现场能照着排查的一句话；未知码原样带出。 */
const XPYUN_HINTS: Record<number, string> = {
  [-1]: '请求头不符合要求',
  [-2]: '参数不合法（SN、内容或份数格式不对）',
  [-3]: '签名失败，检查 XPYUN_UKEY 是否为开发者 UKEY',
  [-4]: '开发者账号未注册',
  1001: '打印机编号不属于该账号',
  1002: '打印机未注册，先调 verifyPrinter 或到平台添加',
  1003: '打印机不在线（与服务器失联超过 30 秒）',
  1004: '订单内容过大，需要拆分',
  1005: '订单号已过期或无效',
  1006: '订单日期格式不正确',
  1008: 'SN 不是芯烨云打印机编号',
  1009: '打印机已存在'
};

const hintFor = (code: number): string => XPYUN_HINTS[code] || '未知返回码';

type XpyunResponse = {
  code: number;
  msg: string;
  data: unknown;
};

export type XpyunLabelPrinterOptions = {
  user?: string;
  ukey?: string;
  /** 默认打印机 SN；门店没有单独配置时使用。 */
  sn?: string;
  /** 门店 ID → 打印机 SN，避免把 A 店的杯贴打到 B 店。 */
  storeSn?: Record<string, string>;
  apiBase?: string;
  timeoutMs?: number;
  labelWidthMm?: number;
  labelHeightMm?: number;
  gapMm?: number;
  timeZone?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const trim = (value: string | undefined): string => value?.trim() || '';

export class XpyunLabelPrinter implements LabelPrinter {
  readonly name = 'xpyun-barcode-label';
  readonly mode = 'live';
  readonly transport = 'cloud' as const;

  private readonly user: string;
  private readonly ukey: string;
  private readonly defaultSn: string;
  private readonly storeSn: Record<string, string>;
  private readonly apiBase: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly style: XpyunLabelStyle;

  constructor(options: XpyunLabelPrinterOptions) {
    const user = trim(options.user);
    const ukey = trim(options.ukey);
    if (!user) {
      throw new Error('[integrations] 条码云 live 模式缺少 XPYUN_USER：请在条码云平台获取开发者账号');
    }
    if (!ukey) {
      throw new Error('[integrations] 条码云 live 模式缺少 XPYUN_UKEY：请在部署环境配置，不是打印机机身 KEY');
    }
    this.user = user;
    this.ukey = ukey;
    this.defaultSn = trim(options.sn);
    this.storeSn = options.storeSn || {};
    this.apiBase = trim(options.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 10_000;
    this.fetchImpl = options.fetchImpl || fetch;
    this.now = options.now || Date.now;
    this.style = {
      widthMm: options.labelWidthMm || DEFAULT_XPYUN_LABEL_STYLE.widthMm,
      heightMm: options.labelHeightMm || DEFAULT_XPYUN_LABEL_STYLE.heightMm,
      gapMm: options.gapMm ?? DEFAULT_XPYUN_LABEL_STYLE.gapMm,
      timeZone: trim(options.timeZone) || DEFAULT_XPYUN_LABEL_STYLE.timeZone
    };
  }

  get labelStyle(): XpyunLabelStyle {
    return this.style;
  }

  /**
   * 打印任意一份标签 XML，返回云端订单编号。
   * 给自检标、运维补打用：与杯贴走同一条鉴权与信封，只是内容不同。
   */
  async printContent(content: string, storeId = ''): Promise<{ ok: boolean; orderId?: string; error?: string }> {
    const sn = this.snFor(storeId);
    if (!sn) {
      return { ok: false, error: '门店未配置条码云打印机 SN（XPYUN_SN / XPYUN_STORE_SN）' };
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return { ok: false, error: '标签内容超过条码云上限' };
    }
    const blocked = await this.blockedReason(sn);
    if (blocked) return { ok: false, error: blocked };
    return this.send(sn, content);
  }

  /**
   * 下发前的状态闸。
   *
   * 实测：mode=0 只在「完全离线」时拒绝；status=2（在线但缺纸/开盖）云端照收不误，
   * 任务静默压在机器队列里（现场一次积了 7 张），纸修好后一次性吐一堆过期杯贴。
   * 所以下发前先问一次状态：明确 0/2 就不发。
   * 状态接口本身失败（网络抖动、超时）则放行——别让一次抖动挡住出杯，
   * 离线仍由 mode=0 兜底，是否真出纸由 orderPrinted 回查。
   */
  private async blockedReason(sn: string): Promise<string | null> {
    let response: XpyunResponse;
    try {
      response = await this.call(PRINTER_STATUS_PATH, { sn });
    } catch {
      return null;
    }
    if (response.code !== 0) return null;
    const code = Number((response.data as { status?: unknown } | null)?.status);
    if (code === 2) return '打印机在线但异常（多为缺纸/开盖），任务只会在云端积压不出纸，本次未下发';
    if (code !== 1) return '打印机离线，本次未下发';
    return null;
  }

  private async send(sn: string, content: string): Promise<{ ok: boolean; orderId?: string; error?: string }> {
    try {
      // mode=0：机器不在线就让云端直接拒绝，绝不把「已入队」当成「已出纸」。
      const response = await this.call(PRINT_LABEL_PATH, { sn, content, copies: 1, mode: 0 });
      if (response.code !== 0) {
        return {
          ok: false,
          error: `条码云拒绝打印（${response.code} ${response.msg || hintFor(response.code)}）：${hintFor(
            response.code
          )}`
        };
      }
      return { ok: true, orderId: trim(String(response.data ?? '')) || undefined };
    } catch (error) {
      return { ok: false, error: (error as Error).message || '条码云打印失败' };
    }
  }

  async print(job: PrintJobPayload): Promise<PrintResult> {
    const sn = this.snFor(job.storeId);
    if (!sn) {
      return {
        ok: false,
        error: `门店未配置条码云打印机 SN（XPYUN_SN / XPYUN_STORE_SN），${job.orderNumber} 本次未打印`
      };
    }
    if (!job.labels.length) return { ok: false, error: '打印任务没有杯贴内容' };

    // 整单只问一次状态：一张都不该发时，别先发出去半单再报错。
    const blocked = await this.blockedReason(sn);
    if (blocked) return { ok: false, error: `${blocked}，${job.orderNumber} 本次未打印` };

    const refs: string[] = [];
    for (let index = 0; index < job.labels.length; index += 1) {
      const content = buildXpyunCupLabel(job.labels[index], this.style);
      if (content.length > MAX_CONTENT_CHARS) {
        return {
          ok: false,
          error: this.describeFailure(index, job.labels.length, refs.length, '杯贴内容超过条码云上限')
        };
      }
      const sent = await this.send(sn, content);
      if (!sent.ok) {
        return {
          ok: false,
          error: this.describeFailure(index, job.labels.length, refs.length, sent.error || '条码云打印失败')
        };
      }
      if (sent.orderId) refs.push(sent.orderId);
    }

    return { ok: true, providerRef: refs.join(',') || undefined };
  }

  async status(): Promise<DeviceStatus> {
    const sn = this.defaultSn || Object.values(this.storeSn)[0];
    if (!sn) {
      return { online: false, mode: this.mode, detail: '未配置条码云打印机 SN（XPYUN_SN / XPYUN_STORE_SN）' };
    }
    try {
      const response = await this.call(PRINTER_STATUS_PATH, { sn });
      const data = (response.data || {}) as { status?: unknown; version?: unknown };
      const code = Number(data.status);
      const version = trim(String(data.version ?? ''));
      if (response.code !== 0) {
        return {
          online: false,
          mode: this.mode,
          detail: `条码云状态查询失败（${response.code} ${response.msg || hintFor(response.code)}）`
        };
      }
      const label = code === 1 ? '在线正常' : code === 2 ? '在线异常（多为缺纸）' : '离线';
      return {
        online: code === 1,
        mode: this.mode,
        detail: `芯烨条码云：${label}${version ? ` · 固件 ${version}` : ''}`
      };
    } catch (error) {
      return { online: false, mode: this.mode, detail: (error as Error).message };
    }
  }

  /**
   * 注册打印机（verifyPrinter）。文档写明「打印之前必须调用本接口注册」，
   * 新店上线第一步：没注册的 SN 一律 1002，前面所有打印都会白跑。
   */
  async register(name: string, storeId = ''): Promise<{ ok: boolean; detail: string }> {
    const sn = this.snFor(storeId);
    if (!sn) return { ok: false, detail: '未配置条码云打印机 SN（XPYUN_SN / XPYUN_STORE_SN）' };
    const label = trim(name);
    if (!label) return { ok: false, detail: '注册需要打印机名称（name）' };
    try {
      const response = await this.call(VERIFY_PRINTER_PATH, { sn, name: label });
      if (response.code !== 0) {
        return {
          ok: false,
          detail: `注册失败（${response.code} ${response.msg || hintFor(response.code)}）：${hintFor(response.code)}`
        };
      }
      return {
        ok: response.data === true,
        detail: response.data === true ? `已注册 ${sn}` : `云端未接受 ${sn}，请核对 SN`
      };
    } catch (error) {
      return { ok: false, detail: (error as Error).message || '注册失败' };
    }
  }

  /**
   * 回查一张杯贴是否真的出纸了（queryOrderState）。
   * 云通道「已受理」≠「已打印」，补打与对账都靠这一步。
   */
  async orderPrinted(orderId: string): Promise<boolean | null> {
    const id = trim(orderId);
    if (!id) return null;
    try {
      const response = await this.call(ORDER_STATE_PATH, { orderId: id });
      if (response.code !== 0) return null;
      return response.data === true;
    } catch {
      return null;
    }
  }

  /** 门店优先，其次默认 SN；SN 不属于密钥，可以出现在错误提示里。 */
  private snFor(storeId: string): string {
    return trim(this.storeSn[storeId]) || this.defaultSn;
  }

  /** 失败信息必须说明第几张、已经下发几张，避免运维误以为整单没打而重复补打。 */
  private describeFailure(index: number, total: number, sent: number, reason: string): string {
    const head = `第 ${index + 1}/${total} 张：${reason}`;
    return sent > 0 ? `${head}；已下发 ${sent} 张，请核对后补打` : head;
  }

  private async call(path: string, params: Record<string, string | number>): Promise<XpyunResponse> {
    // 条码云签名：SHA1(user + UserKEY + timestamp)，timestamp 是 10 位秒级。
    const timestamp = String(Math.floor(this.now() / 1000));
    const sign = createHash('sha1').update(`${this.user}${this.ukey}${timestamp}`).digest('hex');
    const body = JSON.stringify({ user: this.user, timestamp, sign, ...params });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json;charset=UTF-8' },
        body,
        signal: controller.signal
      });
    } catch (error) {
      const message = (error as Error).name === 'AbortError' ? `超时 ${this.timeoutMs}ms` : (error as Error).message;
      throw new Error(`条码云接口连接失败：${message || '网络异常'}`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`条码云接口返回 HTTP ${response.status}`);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('条码云接口返回内容无法解析');
    }
    const row = (payload || {}) as { code?: unknown; msg?: unknown; data?: unknown };
    return {
      code: Number(row.code),
      msg: trim(String(row.msg ?? '')),
      data: row.data
    };
  }
}