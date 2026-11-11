import type { CupLabelPayload, PrintJobPayload } from '../contracts';

/**
 * 芯烨 XP-420B 杯贴：TSPL 指令渲染。
 *
 * 机器是 203dpi 的 USB 桌面标签机，1 mm = 8 dots，所以 40×60mm 的纸就是 320×480 个点。
 * 这里只把「设计稿坐标」翻译成 TSPL，不做任何 I/O —— 打印由门店代理负责，
 * 云端服务器碰不到 USB 口。
 *
 * 约定：
 * - 版式常量集中在 CUP_LABEL_LAYOUT，改设计只改这里；
 * - 中文一律走点阵字体（默认 TSS24.BF2，GB 编码，由代理转码后发送）；
 * - 所有内容先过 tsplText 清洗，避免引号/换行把指令撑破；
 * - 每个杯贴是独立一页（CLS ... PRINT 1,1），一单多杯各打一张。
 */

/** 203dpi：1 mm = 8 dots。 */
export const TSPL_DOTS_PER_MM = 8;

export type TsplLabelStyle = {
  widthMm: number;
  heightMm: number;
  /** 标签间距（mm），40×60 铜版纸常见 2mm。 */
  gapMm: number;
  gapOffsetMm: number;
  /** 中文点阵字体名；芯烨出厂固件通常是 TSS24.BF2（GB2312 简体）。 */
  fontCn: string;
  /** 打印浓度 0–15，热敏纸偏冷时调到 10 左右。 */
  density: number;
  /** 走纸速度（inch/s），2–6。 */
  speed: number;
  /** 时间按门店当地时间出，避免服务器 UTC 让吧台看错单。 */
  timeZone: string;
};

export const DEFAULT_TSPL_LABEL_STYLE: TsplLabelStyle = {
  widthMm: 40,
  heightMm: 60,
  gapMm: 2,
  gapOffsetMm: 0,
  fontCn: 'TSS24.BF2',
  density: 8,
  speed: 4,
  timeZone: 'Asia/Shanghai'
};

/** TSPL 内建 ASCII 字体：编号 → 单字符宽高（dots）。 */
const ASCII_FONTS = {
  /** 8×12，最小；只给够用的短数字。 */
  tiny: { id: '1', width: 8, height: 12 },
  /** 12×20，单据小字的标准档。 */
  small: { id: '0', width: 12, height: 20 },
  /** 16×24，眉题/英文系列名。 */
  mid: { id: '3', width: 16, height: 24 },
  /** 32×48，取餐号。 */
  hero: { id: '5', width: 32, height: 48 }
} as const;

type AsciiFont = (typeof ASCII_FONTS)[keyof typeof ASCII_FONTS];

/**
 * 版式常量（dots）。与设计稿 1:1 对应：
 * 顶部 2.5mm 留白 → 品牌 → 取餐号 → 系列/品名 → 规格与时间 → 二维码 → 门店 → 电话。
 *
 * 留白的分配原则：身份区（品牌/取餐号）紧、内容区（系列/品名/规格）松、
 * 底部（码/门店）收。单号不上杯贴——顾客与吧台都不读它，省下的一行换成行距。
 */
export const CUP_LABEL_LAYOUT = {
  width: 320,
  height: 480,
  /** 左右安全边距 2.5mm（20 dots），也是横线起止。 */
  margin: 20,
  /** 右对齐基线（320 - 20）。 */
  right: 300,
  /** 水平居中基线。 */
  center: 160,
  brand: { x: 20, y: 20, size: 24 },
  cupSeq: { y: 24 },
  rule: { x: 20, width: 280, thickness: 2 },
  rule1Y: 54,
  eyebrow: { x: 20, y: 64, size: 24 },
  hero: { x: 20, y: 94 },
  /**
 * 顾客称呼：预算 3 个「字格」——一个汉字算 1 格、一个 ASCII 算半格。
 * 所以中文留 3 个字，英文能留 6 个字母（Alexander → Alexan…），
 * 中英混排（Lily茶）按实际格数算，不会出现「英文名字被砍一半」。
 */
  customer: { y: 113, size: 24, maxUnits: 3, maxDots: 140 },
  rule2Y: 176,
  /** 系列：中文系列字 3mm + 英文系列名 2mm，英文右移 12 dots，基线抬 4 dots。 */
  series: { x: 20, y: 186, size: 24, enGap: 12, enDy: 4 },
  product: { x: 20, y: 216, size: 24 },
  option: { x: 20, y: 254, size: 24 },
  time: { y: 254 },
  rule3Y: 284,
  qr: { y: 294, cell: 5, modules: 21 },
  store: { y: 408, size: 24 },
  tel: { y: 438 }
} as const;

/**
 * 字距（dots）。点阵字体没有字距参数，也拉不了 track：
 * 只能逐字发 TEXT、自己把起点往右挪。中文 +3 点（0.375mm）、ASCII +2 点，
 * 刚好是「看得出松散、又不散架」的那一档；取餐号再宽一点，让它站得住。
 */
export const CUP_LABEL_TRACK = {
  /** 品牌是整张纸的门面，收紧一档才不像被拉散的标题。 */
  brand: 2,
  cn: 3,
  ascii: 2,
  hero: 4,
  /** 时间是小字数字，拉太开反而碎。 */
  time: 1
} as const;

/** 品牌顺序：醒 → 松 → 庆 → 眠；标签上只出英文，中文系列字留在品名里。 */
const SERIES_EN: Record<string, string> = {
  xing: 'GOOD DAY',
  song: 'CHILL',
  qing: 'CHEERS',
  mian: 'GOOD NIGHT'
};

/** TSPL 用双引号包内容，内部引号与换行必须先清掉，否则整张标签会乱码。 */
export function tsplText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/["“”]/g, "'")
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 满格字判定：中文与全角标点占一格。
 * 省略号按全角算——中文点阵字体的「…」是占满一格的，宁可多留 12 点，
 * 也不能让右对齐的那一行戳出 300 的边界。
 */
function isFullWidth(char: string): boolean {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(char) || char === '…' || char === '⋯';
}

/** 粗略字宽：中文按满格，ASCII 按半宽。用于右对齐/居中，误差在 1 个点内。 */
export function measureDots(text: string, cjkDots: number, asciiDots = Math.round(cjkDots / 2)): number {
  let width = 0;
  for (const char of text) {
    width += isFullWidth(char) ? cjkDots : asciiDots;
  }
  return width;
}

/** 超长时按整字截断并补省略号，绝不把一个字劈成两半。 */
export function fitDots(text: string, maxDots: number, cjkDots: number, asciiDots?: number): string {
  const perAscii = asciiDots ?? Math.round(cjkDots / 2);
  if (measureDots(text, cjkDots, perAscii) <= maxDots) return text;
  const ellipsisDots = cjkDots;
  const chars = Array.from(text);
  let out = '';
  let width = 0;
  for (const char of chars) {
    const w = measureDots(char, cjkDots, perAscii);
    if (width + w + ellipsisDots > maxDots) break;
    out += char;
    width += w;
  }
  return `${out.trimEnd()}…`;
}

/** 单字符占宽（dots）：中文满格，ASCII 半格。 */
function charDots(char: string, cjkDots: number, asciiDots: number): number {
  return isFullWidth(char) ? cjkDots : asciiDots;
}

/** 计入字距后的整串宽度：n 个字 + (n-1) 个间隙。 */
export function trackedWidth(text: string, cjkDots: number, asciiDots: number, tracking: number): number {
  const chars = Array.from(text);
  if (!chars.length) return 0;
  return chars.reduce((w, char) => w + charDots(char, cjkDots, asciiDots), 0) + (chars.length - 1) * tracking;
}

/** fitDots 的加字距版本：截断时把字距也算进预算，免得压到二维码/右边界。 */
export function fitTracked(
  text: string,
  maxDots: number,
  cjkDots: number,
  asciiDots: number,
  tracking: number
): string {
  if (trackedWidth(text, cjkDots, asciiDots, tracking) <= maxDots) return text;
  const chars = Array.from(text);
  const budget = maxDots - cjkDots - tracking; // 给省略号留一格
  let out = '';
  let width = 0;
  for (const char of chars) {
    const w = charDots(char, cjkDots, asciiDots);
    const next = width + (out ? tracking : 0) + w;
    if (next > budget) break;
    out += char;
    width = next;
  }
  return `${out.trimEnd()}…`;
}

/**
 * 按「字格」截断：汉字 1 格、ASCII 半格，超预算就停并补省略号。
 * 昵称可以是「爱喝奶茶的小仙女」，也可以是「Alexander」——同一个预算下，
 * 中文留 3 个字、英文留 6 个字母，两边看起来一样长，不会一边撑满一边空着。
 */
export function truncateUnits(text: string, maxUnits: number): string {
  const chars = Array.from(text);
  let used = 0;
  let out = '';
  for (const char of chars) {
    const unit = isFullWidth(char) ? 1 : 0.5;
    if (used + unit > maxUnits) return `${out.trimEnd()}…`;
    out += char;
    used += unit;
  }
  return text;
}

/**
 * 「醒·花园蜜香」拆成系列字与茶名。
 * 拆开是为了让系列单独成行、品名只剩茶名，避免同一行里重复「醒」。
 */
export function splitProductName(name: string): { seriesCn: string; teaName: string } {
  const trimmed = tsplText(name);
  const at = trimmed.indexOf('·');
  if (at > 0 && at < trimmed.length - 1) {
    return { seriesCn: trimmed.slice(0, at).trim(), teaName: trimmed.slice(at + 1).trim() };
  }
  return { seriesCn: '', teaName: trimmed };
}

/** 取餐号兜底：杯贴码 A001-1 去掉杯序就是取餐号。 */
export function pickupCodeOf(label: CupLabelPayload): string {
  if (label.pickupCode && label.pickupCode.trim()) return tsplText(label.pickupCode);
  const code = tsplText(label.label);
  const dash = code.lastIndexOf('-');
  return dash > 0 ? code.slice(0, dash) : code;
}

/** 温度与冰量合成一行；热饮不重复写冰量。 */
export function optionLine(temp: string | null, ice: string | null): string {
  const t = tsplText(temp);
  const i = tsplText(ice);
  if (!t) return i;
  if (!i || i === t) return t;
  return `${t} · ${i}`;
}

/** 下单时间压成「11-10 14:32」，按门店时区出，不跟服务器 UTC。 */
export function formatLabelTime(iso: string | null | undefined, timeZone: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

type Cmd = string;

type TextOpts = {
  font: string;
  /** 中文满格宽度（dots）；纯 ASCII 时与 asciiDots 相同。 */
  cjkDots: number;
  asciiDots: number;
  tracking: number;
  /** 双打加粗：同一字错 1 个点再打一遍。 */
  bold?: boolean;
};

const textCmd = (x: number, y: number, font: string, char: string): Cmd =>
  `TEXT ${Math.round(x)},${Math.round(y)},"${font}",0,1,1,"${tsplText(char)}"`;

/**
 * 逐字落指令：点阵字体没有字距参数，只能一字一条 TEXT、自己往右挪。
 * 空格不发指令（省字节），但照样占位，所以留白是设计的一部分，不是漏打。
 */
function line(x: number, y: number, content: string, opts: TextOpts): Cmd[] {
  const cmds: Cmd[] = [];
  let cursor = x;
  for (const char of Array.from(content)) {
    if (char.trim()) {
      cmds.push(textCmd(cursor, y, opts.font, char));
      if (opts.bold) cmds.push(textCmd(cursor + 1, y, opts.font, char));
    }
    cursor += charDots(char, opts.cjkDots, opts.asciiDots) + opts.tracking;
  }
  return cmds;
}

const rule = (y: number, style: TsplLabelStyle): Cmd =>
  `BAR ${CUP_LABEL_LAYOUT.rule.x},${y},${CUP_LABEL_LAYOUT.rule.width},${CUP_LABEL_LAYOUT.rule.thickness}`;

function header(style: TsplLabelStyle): Cmd[] {
  const size = `SIZE ${style.widthMm} mm,${style.heightMm} mm`;
  const gap =
    style.gapOffsetMm === 0
      ? `GAP ${style.gapMm} mm,0 mm`
      : `GAP ${style.gapMm} mm,${style.gapOffsetMm} mm`;
  return [
    size,
    gap,
    'DIRECTION 1',
    `DENSITY ${style.density}`,
    `SPEED ${style.speed}`,
    'SET TEAR ON',
    'CLS'
  ];
}

/**
 * 单张杯贴的完整 TSPL（含 CLS / PRINT）。
 * 每个元素都按版式常量定位，测试里断言的是同一套坐标。
 */
export function buildCupLabelTspl(label: CupLabelPayload, style: TsplLabelStyle = DEFAULT_TSPL_LABEL_STYLE): string {
  const l = CUP_LABEL_LAYOUT;
  const cmds: Cmd[] = header(style);

  // 每种字体一套字宽/字距：中文 24 点满格，ASCII 按半格算，取餐号单独放宽
  const cn: TextOpts = { font: style.fontCn, cjkDots: 24, asciiDots: 12, tracking: CUP_LABEL_TRACK.cn };
  const small: TextOpts = { font: ASCII_FONTS.small.id, cjkDots: 12, asciiDots: 12, tracking: CUP_LABEL_TRACK.ascii };
  const mid: TextOpts = { font: ASCII_FONTS.mid.id, cjkDots: 16, asciiDots: 16, tracking: CUP_LABEL_TRACK.ascii };
  const hero: TextOpts = { font: ASCII_FONTS.hero.id, cjkDots: 32, asciiDots: 32, tracking: CUP_LABEL_TRACK.hero };
  const time: TextOpts = { ...small, tracking: CUP_LABEL_TRACK.time };

  // ① 品牌行 + 杯序（右）：品牌收紧字距，中英之间不留空格，别把右上角的杯序挤到第二行视线里
  cmds.push(...line(l.brand.x, l.brand.y, 'Full愈·时叙', { ...cn, tracking: CUP_LABEL_TRACK.brand }));
  const seq = `${label.cupIndex} / ${label.cupTotal}`;
  cmds.push(...line(l.right - trackedWidth(seq, 12, 12, small.tracking), l.cupSeq.y, seq, small));

  // ② 取餐号眉题
  cmds.push(rule(l.rule1Y, style));
  // 眉题只留中文：2mm 的英文眉题会把 3mm 的取餐号挤得没有呼吸，英文交给系列行
  cmds.push(...line(l.eyebrow.x, l.eyebrow.y, '取餐号', cn));

  // ③ 取餐号（主角）+ 顾客称呼（右，3 个字格：汉字 3 个 / 英文 6 个）
  cmds.push(...line(l.hero.x, l.hero.y, pickupCodeOf(label), hero));
  const name = truncateUnits(tsplText(label.customerName) || '茶客', l.customer.maxUnits);
  // 字格换个算法，宽度再兜一道：万一以后放宽预算，也不会压到取餐号
  const customer = fitTracked(name, l.customer.maxDots, 24, 12, cn.tracking);
  cmds.push(
    ...line(l.right - trackedWidth(customer, 24, 12, cn.tracking), l.customer.y, customer, cn)
  );

  // ④ 系列：中文系列字 3mm，英文系列名 2mm 跟在后面
  cmds.push(rule(l.rule2Y, style));
  const { seriesCn, teaName } = splitProductName(label.productName);
  const seriesEn = label.series ? SERIES_EN[label.series] || '' : '';
  const seriesCnText = tsplText(label.seriesName) || seriesCn;
  if (seriesCnText) {
    cmds.push(...line(l.series.x, l.series.y, seriesCnText, cn));
    if (seriesEn) {
      const enX = l.series.x + trackedWidth(seriesCnText, 24, 12, cn.tracking) + l.series.enGap;
      cmds.push(...line(enX, l.series.y + l.series.enDy, seriesEn, mid));
    }
  }

  // ⑤ 品名（唯一的加粗项）
  const tea = fitTracked(teaName || label.productName, l.rule.width, 24, 12, cn.tracking);
  cmds.push(...line(l.product.x, l.product.y, tea, { ...cn, bold: true }));

  // ⑥ 温度 · 冰量（左） + 下单时间（右）
  const options = fitTracked(optionLine(label.temp, label.ice), 140, 24, 12, cn.tracking);
  if (options) cmds.push(...line(l.option.x, l.option.y, options, cn));
  const when = formatLabelTime(label.orderedAt || label.printedAt, style.timeZone);
  if (when) {
    cmds.push(...line(l.right - trackedWidth(when, 12, 12, time.tracking), l.time.y, when, time));
  }

  // ⑦ 出餐二维码：码值必须是杯贴码，取餐号只给人看
  cmds.push(rule(l.rule3Y, style));
  const qrWidth = l.qr.modules * l.qr.cell;
  const qrX = Math.round((l.width - qrWidth) / 2);
  cmds.push(`QRCODE ${qrX},${l.qr.y},M,${l.qr.cell},A,0,"${tsplText(label.label)}"`);

  // ⑧ 门店 ⑨ 电话
  const store = fitTracked(tsplText(label.storeName), l.rule.width, 24, 12, cn.tracking);
  cmds.push(...line(l.center - trackedWidth(store, 24, 12, cn.tracking) / 2, l.store.y, store, cn));
  const tel = tsplText(label.storePhone);
  if (tel) {
    cmds.push(...line(l.center - trackedWidth(tel, 12, 12, small.tracking) / 2, l.tel.y, tel, small));
  }

  cmds.push('PRINT 1,1');
  return cmds.join('\n');
}

/** 一单多杯：每杯一张独立标签，代理按顺序打印。 */
export function buildTsplJob(
  job: PrintJobPayload,
  style: TsplLabelStyle = DEFAULT_TSPL_LABEL_STYLE
): Array<{ label: string; tspl: string }> {
  return job.labels.map((label) => ({ label: label.label, tspl: buildCupLabelTspl(label, style) }));
}