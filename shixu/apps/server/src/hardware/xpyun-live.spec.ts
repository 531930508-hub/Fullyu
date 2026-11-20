/**
 * 芯烨条码云（sprinter）标签直推：杯贴 XML + 逐张下发 + 离线不假成功。
 *
 * 这些测试用注入的 fetch 模拟条码云开放接口，不发真实网络请求，
 * 也不需要真实 XPYUN_USER / XPYUN_UKEY / SN。
 */
import { createHash } from 'node:crypto';
import {
  XpyunLabelPrinter,
  buildXpyunCalibration,
  buildXpyunCupLabel,
  createIntegrations,
  loadIntegrationsConfig,
  type PrintJobPayload
} from '@teahour/integrations';

type QueuedResponse = {
  body?: unknown;
  /** 非 200 时模拟 HTTP 层错误。 */
  status?: number;
  /** 直接抛出网络错误。 */
  throws?: string;
  urlIncludes?: string;
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(queue: QueuedResponse[]) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = async (url: string, init: any) => {
    calls.push({ url: String(url), init });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch: ${String(url)}`);
    if (next.throws) throw new Error(next.throws);
    if (next.urlIncludes && !String(url).includes(next.urlIncludes)) {
      throw new Error(`unexpected url: ${String(url)}`);
    }
    return jsonResponse(next.body, next.status);
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

/** 条码云是 JSON 信封，这里把请求体解出来方便断言。 */
const bodyOf = (call: { init: any }) => JSON.parse(String(call.init.body)) as Record<string, unknown>;

/** 下发前会先问一次状态；健康机器的回包是 status=1。 */
const okStatus = () => ({ body: { code: 0, msg: 'ok', data: { status: 1, version: 'XP-420B' } } });

/** 只看真正下发的 printLabel 请求，状态闸那次查询不算。 */
const printCalls = (fake: { calls: Array<{ url: string; init: any }> }) =>
  fake.calls.filter((call) => call.url.endsWith('/sprinter/printLabel'));

const build = (
  fetchImpl: typeof fetch,
  options: { storeSn?: Record<string, string>; sn?: string; now?: () => number } = {}
) =>
  new XpyunLabelPrinter({
    user: 'test-user',
    ukey: 'test-ukey',
    sn: options.sn ?? '',
    storeSn: options.storeSn ?? {},
    apiBase: 'https://xpyun.test',
    timeoutMs: 10000,
    labelWidthMm: 40,
    labelHeightMm: 60,
    gapMm: 2,
    fetchImpl,
    now: options.now || (() => 1_700_000_000_000)
  });

const job = (labels: Array<Partial<PrintJobPayload['labels'][number]>> = [{}], reprint = false): PrintJobPayload => ({
  orderId: 'order-1',
  orderNumber: 'A001',
  storeId: 'sh-xuhui',
  reprint,
  labels: labels.map((patch, index) => ({
    label: `A001-${index + 1}`,
    orderNumber: 'A001',
    storeName: '时叙·上海徐汇店',
    productName: '生椰拿铁',
    temp: '热',
    ice: null,
    cupIndex: index + 1,
    cupTotal: 2,
    printedAt: '2026-11-11T01:30:00.000Z',
    customerName: '小林',
    ...patch
  }))
});

describe('芯烨条码云标签适配', () => {
  it('杯贴是 PAGE/LABEL XML，码值是杯贴码，签名与信封按条码云规范生成', async () => {
    const fake = fakeFetch([okStatus(), { body: { code: 0, msg: 'ok', data: 'XPY-1' } }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job());

    expect(result).toEqual({ ok: true, providerRef: 'XPY-1' });
    expect(printCalls(fake)).toHaveLength(1);
    const call = printCalls(fake)[0];
    expect(call.url).toBe('https://xpyun.test/sprinter/printLabel');
    expect(call.init.method).toBe('POST');
    // 文档明确要求 JSON 信封，表单提交会被判 -1「请求头错误」
    expect(String(call.init.headers['content-type'])).toContain('application/json');

    const body = bodyOf(call);
    expect(body.user).toBe('test-user');
    expect(body.timestamp).toBe('1700000000');
    expect(body.sign).toBe(sha1('test-user' + 'test-ukey' + '1700000000'));
    expect(body.sn).toBe('SN-DEFAULT');
    // mode=0：机器离线就让云端拒绝，不落一条「假成功」的订单
    expect(body.mode).toBe(0);
    expect(body.copies).toBe(1);

    const content = String(body.content);
    expect(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(content).toContain('<PAGE w="40" l="60" ld="2" pt="1">');
    expect(content).toContain('<LABEL id="1">');
    expect(content).toContain('<TEXT');
    expect(content).toContain('取餐号');
    expect(content).toContain('A001');
    // 二维码 s 是模块点数（dot），不是 mm
    expect(content).toMatch(/<QRC x="[\d.]+" y="[\d.]+" s="5" e="M">A001-1<\/QRC>/);
    expect(content).toContain('生椰拿铁');
    // 店名里的中点号已换成竖线，实机不会打成问号
    expect(content).toContain('时叙|上海徐汇店');
  });

  it('同一订单多杯时逐张下发，每张二维码是自己的杯号', async () => {
    const fake = fakeFetch([
      okStatus(),
      { body: { code: 0, msg: 'ok', data: 'XPY-1' } },
      { body: { code: 0, msg: 'ok', data: 'XPY-2' } }
    ]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job([{}, {}]));

    expect(result.ok).toBe(true);
    expect(result.providerRef).toBe('XPY-1,XPY-2');
    // 整单只问一次状态，两张杯贴各下发一次
    expect(fake.calls).toHaveLength(3);
    expect(printCalls(fake)).toHaveLength(2);
    expect(String(bodyOf(printCalls(fake)[0]).content)).toMatch(/>A001-1<\/QRC>/);
    expect(String(bodyOf(printCalls(fake)[1]).content)).toMatch(/>A001-2<\/QRC>/);
    expect(String(bodyOf(printCalls(fake)[1]).content)).toContain('2 / 2');
  });

  it('按门店解析 SN，覆盖默认 SN', async () => {
    const fake = fakeFetch([okStatus(), { body: { code: 0, msg: 'ok', data: 'XPY-SH' } }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT', storeSn: { 'sh-xuhui': 'SN-XUHUI' } });

    await printer.print(job());

    // 状态闸与下发都按门店 SN 走，不能漏回默认 SN
    expect(fake.calls.map((call) => bodyOf(call).sn)).toEqual(['SN-XUHUI', 'SN-XUHUI']);
  });

  it('门店没配 SN 时诚实失败，不向条码云发请求', async () => {
    const fake = fakeFetch([]);
    const printer = build(fake.impl);

    const result = await printer.print(job());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/XPYUN_SN/);
    expect(fake.calls).toHaveLength(0);
  });

  it('云端返回非 0 时带返回码与排错指引，不冒充打印成功', async () => {
    const fake = fakeFetch([
      okStatus(),
      { body: { code: 1003, msg: 'PRINTER_OFFLINE', data: null, serverExecutedTime: 12 } }
    ]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job());

    expect(result.ok).toBe(false);
    expect(result.error).toContain('1003');
    expect(result.error).toContain('不在线');
    expect(result.error).toContain('第 1/1 张');
    expect(result.providerRef).toBeUndefined();
  });

  it('部分杯子失败时说明已下发张数，提示补打核对', async () => {
    const fake = fakeFetch([
      okStatus(),
      { body: { code: 0, msg: 'ok', data: 'XPY-1' } },
      { body: { code: 1003, msg: 'PRINTER_OFFLINE', data: null } }
    ]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job([{}, {}]));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('第 2/2 张');
    expect(result.error).toContain('已下发 1 张');
  });

  it('网络异常返回可读错误，不抛到打印队列之外', async () => {
    const fake = fakeFetch([okStatus(), { throws: 'ECONNRESET' }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/条码云接口连接失败/);
  });

  it('状态闸查询失败时放行下发，不让一次抖动挡住出杯', async () => {
    const fake = fakeFetch([{ throws: 'ETIMEDOUT' }, { body: { code: 0, msg: 'ok', data: 'XPY-1' } }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job());

    expect(result).toEqual({ ok: true, providerRef: 'XPY-1' });
    expect(printCalls(fake)).toHaveLength(1);
  });

  it('缺纸（status=2）时整单不下发：云端会照收并积压，纸修好后吐一堆过期杯贴', async () => {
    const fake = fakeFetch([{ body: { code: 0, msg: 'ok', data: { status: 2, version: 'XP-420B' } } }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job([{}, {}]));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/缺纸/);
    expect(result.error).toContain('A001');
    // 连一张都不该发：部分下发会让排队中的杯贴更难对账
    expect(printCalls(fake)).toHaveLength(0);
  });

  it('离线（status=0）时同样不下发', async () => {
    const fake = fakeFetch([{ body: { code: 0, msg: 'ok', data: { status: 0, version: null } } }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/离线/);
    expect(printCalls(fake)).toHaveLength(0);
  });

  it('茶名里的尖括号与 & 被转义，不能撑破 XML', () => {
    const content = buildXpyunCupLabel(job([{ productName: '醒·<花园>&蜜香' }]).labels[0]);

    expect(content).toContain('&lt;花园&gt;&amp;蜜香');
    expect(content).not.toContain('<花园>');
  });

  it('品牌行用 ASCII 竖线分隔：中点号在 f=7 字库里缺字形，实机会打成「Full愈?时叙」', () => {
    const content = buildXpyunCupLabel(job().labels[0]);

    const brand = content.match(/<TEXT x="3" y="3" f="7">([^<]*)<\/TEXT>/)?.[1];
    expect(brand).toBe('Full愈|时叙');
    expect(brand).not.toContain('\u00B7');
  });

  it('历史单里的热饮占位冰量不印到杯贴：温度行只出「热」', () => {
    const content = buildXpyunCupLabel(job([{ temp: '热', ice: '标准冰' }]).labels[0]);

    expect(content).not.toContain('标准冰');
    expect(content).toMatch(/<TEXT x="3" y="32" f="7">热<\/TEXT>/);
  });

  it('温度·冰量独占规格行，下单时间上移到眉题行右侧', () => {
    const content = buildXpyunCupLabel(job([{ temp: '冰', ice: '标准冰' }]).labels[0]);

    // 规格行不再给日期留位置：40mm 一行放不下「冰 · 标准冰」+「11-10 14:30」
    expect(content).toMatch(/<TEXT x="3" y="32" f="7">冰 \| 标准冰<\/TEXT>/);
    const at = (y: number) =>
      [...content.matchAll(/<TEXT x="(\d+)" y="(\d+)" f="(\d+)"(?: a="right")?>([^<]*)<\/TEXT>/g)]
        .filter(([, , row]) => row === String(y))
        .map(([, x, , , text]) => `${x}:${text}`);
    expect(at(32)).toEqual(['3:冰 | 标准冰']);
    // 时间右对齐在 37mm，与「取餐号」眉题同一行（y=8），两者隔得开
    const eyebrow = at(8);
    expect(eyebrow).toHaveLength(2);
    expect(eyebrow[0]).toBe('3:取餐号');
    expect(eyebrow[1]).toMatch(/^37:\d\d-\d\d \d\d:\d\d$/);
  });

  it('店名、茶名里的中点号也换成竖线，实机不会打成一串问号', () => {
    const content = buildXpyunCupLabel(
      job([{ storeName: '上海·西岸店', productName: '醒·花园蜜香' }]).labels[0]
    );

    expect(content).toContain('上海|西岸店');
    // 系列名被拆成「系列 + 茶名」两段，中点号不会留在纸上
    expect(content).toContain('醒');
    expect(content).toContain('花园蜜香');
    // 整张纸上不该再出现 U+00B7
    expect(content).not.toContain('\u00B7');
  });

  it('坐标一律整数 mm：云端对 x="2.0" 都回 -2，只有 BL 的 w/h 允许小数', () => {
    const content = buildXpyunCupLabel(job().labels[0]);

    // TEXT / SQ / QRC / BL 的 x、y 不能带小数点
    const coords = [
      ...content.matchAll(/<(TEXT|SQ|QRC|BL)\b([^>]*)>/g)
    ].flatMap(([, , attrs]) =>
      [...attrs.matchAll(/\b(x|y|xe|ye)="([^"]*)"/g)].map(([, name, value]) => `${name}=${value}`)
    );
    expect(coords.length).toBeGreaterThan(10);
    for (const pair of coords) expect(pair).not.toMatch(/\./);

    // 而细线的宽度/高度必须能写小数，否则 0.25mm 的线做不出来
    expect(content).toMatch(/<BL x="\d+" y="\d+" w="34" h="0.25"\/>/);
  });

  it('二维码 s 是 dot 单位，y 与 PAGE 尺寸也是整数', () => {
    const content = buildXpyunCupLabel(job().labels[0]);

    expect(content).toMatch(/<QRC x="\d+" y="\d+" s="5" e="M">/);
    expect(content).toMatch(/<PAGE w="40" l="60" ld="2"/);
  });

  it('缺少 user 或 UKEY 时启动即失败，错误信息只提变量名不回显密钥', () => {
    expect(
      () =>
        new XpyunLabelPrinter({
          user: '',
          ukey: 'u',
          sn: 'SN',
          storeSn: {},
          apiBase: 'https://xpyun.test',
          timeoutMs: 10000,
          labelWidthMm: 40,
          labelHeightMm: 60,
          gapMm: 2
        })
    ).toThrow(/XPYUN_USER/);
    expect(
      () =>
        new XpyunLabelPrinter({
          user: 'u',
          ukey: '',
          sn: 'SN',
          storeSn: {},
          apiBase: 'https://xpyun.test',
          timeoutMs: 10000,
          labelWidthMm: 40,
          labelHeightMm: 60,
          gapMm: 2
        })
    ).toThrow(/XPYUN_UKEY/);
  });

  it('status 用 queryPrinterStatus 的三态：1 在线 / 2 异常 / 0 离线', async () => {
    const online = fakeFetch([{ body: { code: 0, msg: 'ok', data: { status: 1, version: '02.02.077.002' } } }]);
    const jammed = fakeFetch([{ body: { code: 0, msg: 'ok', data: { status: 2, version: '02.02.077.002' } } }]);
    const offline = fakeFetch([{ body: { code: 0, msg: 'ok', data: { status: 0, version: null } } }]);
    const missing = fakeFetch([]);

    const onlineStatus = await build(online.impl, { sn: 'SN-DEFAULT' }).status();
    const jammedStatus = await build(jammed.impl, { sn: 'SN-DEFAULT' }).status();
    const offlineStatus = await build(offline.impl, { sn: 'SN-DEFAULT' }).status();
    const missingStatus = await build(missing.impl).status();

    expect(onlineStatus.online).toBe(true);
    expect(onlineStatus.detail).toContain('02.02.077.002');
    // 在线但异常（多为缺纸）不能当成能打
    expect(jammedStatus.online).toBe(false);
    expect(jammedStatus.detail).toMatch(/缺纸/);
    expect(offlineStatus.online).toBe(false);
    expect(missingStatus.online).toBe(false);
    expect(missingStatus.detail).toMatch(/SN/);
    expect(online.calls[0].url).toBe('https://xpyun.test/sprinter/queryPrinterStatus');
    expect(missing.calls).toHaveLength(0);
  });

  it('register 用 verifyPrinter 注册 SN，参数不合法时如实回报', async () => {
    const ok = fakeFetch([{ body: { code: 0, msg: 'ok', data: true } }]);
    const rejected = fakeFetch([{ body: { code: -2, msg: 'REQUEST_PARAM_INVALID', data: false } }]);

    expect(await build(ok.impl, { sn: 'S420BYH26716002' }).register('西岸店杯贴')).toEqual({
      ok: true,
      detail: '已注册 S420BYH26716002'
    });
    const call = ok.calls[0];
    expect(call.url).toBe('https://xpyun.test/sprinter/verifyPrinter');
    expect(bodyOf(call).sn).toBe('S420BYH26716002');
    expect(bodyOf(call).name).toBe('西岸店杯贴');

    const failed = await build(rejected.impl, { sn: 'S420BYH267160028' }).register('西岸店杯贴');
    expect(failed.ok).toBe(false);
    expect(failed.detail).toContain('-2');
    // 名称是必填项，空名字不该把请求发出去
    const skipped = fakeFetch([]);
    expect((await build(skipped.impl, { sn: 'SN' }).register('  ')).ok).toBe(false);
    expect(skipped.calls).toHaveLength(0);
  });

  it('orderPrinted 用 queryOrderState 回查是否真的出纸，异常时返回 null 不瞎猜', async () => {
    const yes = fakeFetch([{ body: { code: 0, msg: 'ok', data: true } }]);
    const no = fakeFetch([{ body: { code: 0, msg: 'ok', data: false } }]);
    const expired = fakeFetch([{ body: { code: 1005, msg: 'ORDER_NOT_FOUND', data: false } }]);
    const broken = fakeFetch([{ throws: 'ETIMEDOUT' }]);

    expect(await build(yes.impl, { sn: 'SN' }).orderPrinted('XPY-1')).toBe(true);
    expect(await build(no.impl, { sn: 'SN' }).orderPrinted('XPY-1')).toBe(false);
    // 订单过期/编号无效时不能读成「没打印」——那是要人工判断的情况
    expect(await build(expired.impl, { sn: 'SN' }).orderPrinted('XPY-1')).toBeNull();
    expect(await build(broken.impl, { sn: 'SN' }).orderPrinted('XPY-1')).toBeNull();
    expect(bodyOf(yes.calls[0]).orderId).toBe('XPY-1');
  });

  it('自检标覆盖 8 档字体与对齐基线，方便现场一次量出版式偏差', () => {
    const content = buildXpyunCalibration();

    for (const f of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(content).toContain(`f="${f}"`);
    }
    expect(content).toContain('a="right"');
    expect(content).toContain('a="center"');
    expect(content).toContain('<QRC');
    expect(content).toContain('<SQ');
  });

  it('工厂在 PRINTER_DRIVER=xpyun 时启用条码云，缺凭证时启动失败', () => {
    const live = loadIntegrationsConfig({
      uploadRoot: '/tmp/teahour-xpyun-test',
      assetUrl: (key) => `https://cdn.test/${key}`,
      env: {
        PRINTER_DRIVER: 'xpyun',
        INTEGRATIONS_PRINTER_MODE: 'live',
        XPYUN_USER: 'test-user',
        XPYUN_UKEY: 'test-ukey',
        XPYUN_SN: 'SN-DEFAULT',
        XPYUN_STORE_SN: '{"sh":"SN-SH"}'
      }
    });
    const integrations = createIntegrations(live);
    expect(integrations.printer.name).toBe('xpyun-barcode-label');
    expect(integrations.printer.mode).toBe('live');
    expect(integrations.printer.transport).toBe('cloud');
    expect(integrations.payment.mode).toBe('mock');

    const missing = loadIntegrationsConfig({
      uploadRoot: '/tmp/teahour-xpyun-test',
      assetUrl: (key) => `https://cdn.test/${key}`,
      env: { PRINTER_DRIVER: 'xpyun', INTEGRATIONS_PRINTER_MODE: 'live' }
    });
    expect(() => createIntegrations(missing)).toThrow(/XPYUN_USER/);
  });

  it('XPYUN_STORE_SN 不是合法 JSON 时直接报错，避免把杯贴打到错误的机器', () => {
    expect(() =>
      loadIntegrationsConfig({
        uploadRoot: '/tmp/teahour-xpyun-test',
        assetUrl: (key) => `https://cdn.test/${key}`,
        env: { XPYUN_STORE_SN: 'not-json' }
      })
    ).toThrow(/XPYUN_STORE_SN/);
  });
});