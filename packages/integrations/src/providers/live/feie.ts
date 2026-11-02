import { createHash } from 'node:crypto';
import type {
  CupLabelPayload,
  DeviceStatus,
  IntegrationsConfig,
  LabelPrinter,
  PrintJobPayload,
  PrintResult
} from '../../contracts';

/**
 * 飞鹅云标签机真实适配（Open_printLabelMsg）。
 *
 * 杯贴右侧打印杯号二维码，内容与 orderUnit.label 完全一致（如 A001-1），
 * 固定式二维扫码器读到后直接走营业台现有的 /store/scan 出餐接口。
 *
 * 凭证只从环境变量读取；任何状态、错误与日志都不回显 UKEY 或完整 SN。
 */
export type FeieLabelPrinterOptions = Pick<
  IntegrationsConfig['feie'],
  | 'user'
  | 'ukey'
  | 'sn'
  | 'storeSn'
  | 'apiBase'
  | 'timeoutMs'
  | 'labelWidthMm'
  | 'labelHeightMm'
  | 'labelGap'
> & {
  /** 测试可注入。 */
  fetchImpl?: typeof fetch;
  /** 测试可注入，返回毫秒时间戳。 */
  now?: () => number;
};

const LABEL_API = '/Api/Open/';
/** 飞鹅 content 上限 5000 字节。 */
const MAX_CONTENT_BYTES = 5000;
/** 二维码纠错等级：杯贴可能被水汽/杯套遮挡，用 M（15%）。 */
const QR_EC = 'M';
/** 二维码模块放大倍数，40×30mm 标签下约 12mm 见方。 */
const QR_SCALE = '5';

const trim = (value: string | undefined | null): string => String(value ?? '').trim();

/** 标签文本必须转义，否则商品名里的尖括号会被当成排版标签。 */
export function escapeFeieText(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '');
}

/**
 * 按可用点宽截断，避免长商品名/店名压到二维码上。中文按整宽计。
 * 先截断原文再转义：否则可能把 &lt; 截成 &l，排版标签直接坏掉。
 */
export function fitFeieText(value: string, maxDots: number, asciiDots: number, cjkDots: number): string {
  const raw = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '');
  let width = 0;
  let text = '';
  for (const char of raw) {
    const charWidth = char.charCodeAt(0) > 127 ? cjkDots : asciiDots;
    if (width + charWidth > maxDots) break;
    width += charWidth;
    text += char;
  }
  return escapeFeieText(text);
}

export type FeieLabelStyle = {
  widthMm: number;
  heightMm: number;
  gap: string;
};

/**
 * 生成一张杯贴的飞鹅标签内容。
 * 40×30mm = 320×240 dots；左侧信息栏 190 dots，右侧二维码约 110 dots。
 */
export function buildFeieLabelContent(label: CupLabelPayload, style: FeieLabelStyle): string {
  const widthDots = style.widthMm * 8;
  const heightDots = style.heightMm * 8;
  const marginX = Math.max(Math.round(widthDots * 0.03), 4);
  const marginY = Math.max(Math.round(heightDots * 0.03), 4);
  const qrScale = Math.max(Math.round(Math.min(widthDots, heightDots) * 0.45), 90);
  const qrX = Math.max(widthDots - marginX - qrScale, marginX);
  const qrY = Math.round(heightDots * 0.25);
  const textWidth = Math.max(qrX - marginX - 6, 60);

  const orderLine = fitFeieText(label.orderNumber, textWidth, 26, 40);
  const productLine = fitFeieText(label.productName, textWidth, 12, 24);
  const optionLine = fitFeieText(
    [label.temp, label.ice].filter(Boolean).join(' · ') || '—',
    textWidth,
    12,
    24
  );
  const cupLine = `${label.cupIndex}/${label.cupTotal}`;
  const storeLine = fitFeieText(label.storeName, textWidth, 12, 24);
  const timeLine = formatPrintedAt(label.printedAt);

  const texts = [
    `<TEXT x="${marginX}" y="${marginY}" font="5" w="1" h="1">${orderLine}</TEXT>`,
    `<TEXT x="${marginX}" y="${marginY + 56}" font="12" w="1" h="1">${productLine}</TEXT>`,
    `<TEXT x="${marginX}" y="${marginY + 86}" font="12" w="1" h="1">${optionLine} · ${cupLine}</TEXT>`,
    `<TEXT x="${marginX}" y="${marginY + 116}" font="12" w="1" h="1">${storeLine}</TEXT>`,
    `<TEXT x="${marginX}" y="${marginY + 146}" font="10" w="1" h="1">${timeLine}</TEXT>`
  ];

  const qr = `<QR x="${qrX}" y="${qrY}" e="${QR_EC}" w="${QR_SCALE}">${escapeFeieText(label.label.trim().toUpperCase())}</QR>`;

  return [
    `<SIZE>${style.widthMm},${style.heightMm}</SIZE>`,
    `<GAP>${style.gap}</GAP>`,
    '<DIRECTION>1</DIRECTION>',
    ...texts,
    qr
  ].join('');
}

/** 打印时间用 MM-DD HH:mm（服务器本地时区），与营业台一致。 */
function formatPrintedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type FeieResponse = {
  ret: number;
  msg: string;
  data: unknown;
};

export class FeieLabelPrinter implements LabelPrinter {
  readonly name = 'feie-cloud-label';
  readonly mode = 'live';

  private readonly user: string;
  private readonly ukey: string;
  private readonly defaultSn: string;
  private readonly storeSn: Record<string, string>;
  private readonly apiBase: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly style: FeieLabelStyle;

  constructor(options: FeieLabelPrinterOptions) {
    const user = trim(options.user);
    const ukey = trim(options.ukey);
    if (!user) {
      throw new Error('[integrations] 飞鹅 live 模式缺少 FEIE_USER：请在飞鹅开发者后台获取账号');
    }
    if (!ukey) {
      throw new Error('[integrations] 飞鹅 live 模式缺少 FEIE_UKEY：请在部署环境配置，UKEY 不是打印机机身 KEY');
    }
    this.user = user;
    this.ukey = ukey;
    this.defaultSn = trim(options.sn);
    this.storeSn = options.storeSn || {};
    this.apiBase = (trim(options.apiBase) || 'https://api.de.feieyun.com').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 10_000;
    this.fetchImpl = options.fetchImpl || fetch;
    this.now = options.now || Date.now;
    this.style = {
      widthMm: options.labelWidthMm || 40,
      heightMm: options.labelHeightMm || 30,
      gap: trim(options.labelGap) || '2,0'
    };
  }

  async print(job: PrintJobPayload): Promise<PrintResult> {
    const sn = this.snFor(job.storeId);
    if (!sn) {
      return {
        ok: false,
        error: `门店未配置飞鹅标签机 SN（FEIE_SN / FEIE_STORE_SN），${job.orderNumber} 本次未打印`
      };
    }
    if (!job.labels.length) return { ok: false, error: '打印任务没有杯贴内容' };

    const refs: string[] = [];
    for (let index = 0; index < job.labels.length; index += 1) {
      const content = buildFeieLabelContent(job.labels[index], this.style);
      if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
        return {
          ok: false,
          error: this.describeFailure(index, job.labels.length, refs.length, '杯贴内容超过飞鹅 5000 字节上限')
        };
      }
      try {
        const response = await this.call('Open_printLabelMsg', { sn, content, times: '1' });
        if (response.ret !== 0) {
          return {
            ok: false,
            error: this.describeFailure(
              index,
              job.labels.length,
              refs.length,
              `飞鹅拒绝打印（${response.ret}）：${response.msg || '未知错误'}`
            )
          };
        }
        refs.push(trim(String(response.data ?? '')));
      } catch (error) {
        return {
          ok: false,
          error: this.describeFailure(
            index,
            job.labels.length,
            refs.length,
            (error as Error).message || '飞鹅打印失败'
          )
        };
      }
    }

    return { ok: true, providerRef: refs.filter(Boolean).join(',') || undefined };
  }

  async status(): Promise<DeviceStatus> {
    const sn = this.defaultSn || Object.values(this.storeSn)[0];
    if (!sn) {
      return { online: false, mode: this.mode, detail: '未配置飞鹅打印机 SN（FEIE_SN / FEIE_STORE_SN）' };
    }
    try {
      const response = await this.call('Open_queryPrinterStatus', { sn });
      if (response.ret !== 0) {
        return {
          online: false,
          mode: this.mode,
          detail: `飞鹅状态查询失败（${response.ret}）：${response.msg || '未知错误'}`
        };
      }
      const text = trim(String(response.data ?? ''));
      const online = text.includes('在线');
      return {
        online,
        mode: this.mode,
        detail: `飞鹅标签机：${text || '未知状态'}`
      };
    } catch (error) {
      return { online: false, mode: this.mode, detail: (error as Error).message };
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

  private async call(apiname: string, params: Record<string, string>): Promise<FeieResponse> {
    const stime = String(Math.floor(this.now() / 1000));
    // 飞鹅签名：SHA1(user + UKEY + stime)，40 位小写十六进制。
    const sig = createHash('sha1').update(`${this.user}${this.ukey}${stime}`).digest('hex');
    const form = new URLSearchParams({ user: this.user, stime, sig, apiname, ...params });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${LABEL_API}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: form.toString(),
        signal: controller.signal
      });
    } catch (error) {
      const message = (error as Error).name === 'AbortError' ? `超时 ${this.timeoutMs}ms` : (error as Error).message;
      throw new Error(`飞鹅接口连接失败：${message || '网络异常'}`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`飞鹅接口返回 HTTP ${response.status}`);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('飞鹅接口返回内容无法解析');
    }
    const row = (payload || {}) as { ret?: unknown; msg?: unknown; data?: unknown };
    return {
      ret: Number(row.ret),
      msg: trim(String(row.msg ?? '')),
      data: row.data
    };
  }
}
