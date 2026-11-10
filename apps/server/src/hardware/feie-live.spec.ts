/**
 * 飞鹅云标签机 live 适配：杯贴二维码 + 每店 SN。
 *
 * 这些测试用注入的 fetch 模拟飞鹅开放接口，不发真实网络请求，也不需要真实 UKEY / SN。
 */
import { createHash } from 'node:crypto';
import {
  FeieLabelPrinter,
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

const build = (
  fetchImpl: typeof fetch,
  options: { storeSn?: Record<string, string>; sn?: string; now?: () => number } = {}
) =>
  new FeieLabelPrinter({
    user: 'test-user',
    ukey: 'test-ukey',
    sn: options.sn ?? '',
    storeSn: options.storeSn ?? {},
    apiBase: 'https://feie.test',
    timeoutMs: 10000,
    labelWidthMm: 40,
    labelHeightMm: 30,
    labelGap: '2,0',
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
    cupTotal: labels.length,
    printedAt: '2026-11-01T06:05:00.000Z',
    ...patch
  }))
});

const sha1 = (text: string): string => createHash('sha1').update(text).digest('hex');
const formOf = (call: { init: any }): URLSearchParams => new URLSearchParams(String(call.init.body));

describe('飞鹅云标签机 live 适配', () => {
  it('杯贴内容带 SIZE、TEXT 和包含杯号的二维码，签名按 user+UKEY+stime 生成', async () => {
    const fake = fakeFetch([{ body: { ret: 0, msg: 'ok', data: 'FEIE-1' } }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job());

    expect(result).toEqual({ ok: true, providerRef: 'FEIE-1' });
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(call.url).toBe('https://feie.test/Api/Open/');
    expect(call.init.method).toBe('POST');
    expect(String(call.init.headers['content-type'])).toContain('application/x-www-form-urlencoded');

    const form = formOf(call);
    expect(form.get('apiname')).toBe('Open_printLabelMsg');
    expect(form.get('user')).toBe('test-user');
    expect(form.get('sn')).toBe('SN-DEFAULT');
    expect(form.get('stime')).toBe('1700000000');
    expect(form.get('sig')).toBe(sha1('test-user' + 'test-ukey' + '1700000000'));
    expect(form.get('times')).toBe('1');

    const content = form.get('content') || '';
    expect(content).toContain('<SIZE>40,30</SIZE>');
    expect(content).toContain('<TEXT');
    expect(content).toContain('A001-1');
    expect(content).toMatch(/<QR[^>]*>A001-1<\/QR>/);
    expect(content).toContain('生椰拿铁');
  });

  it('同一订单多杯时逐张下发，每张二维码是自己的杯号', async () => {
    const fake = fakeFetch([
      { body: { ret: 0, msg: 'ok', data: 'FEIE-1' } },
      { body: { ret: 0, msg: 'ok', data: 'FEIE-2' } }
    ]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job([{}, {}]));

    expect(result.ok).toBe(true);
    expect(result.providerRef).toBe('FEIE-1,FEIE-2');
    expect(fake.calls).toHaveLength(2);
    expect(formOf(fake.calls[0]).get('content')).toMatch(/<QR[^>]*>A001-1<\/QR>/);
    expect(formOf(fake.calls[1]).get('content')).toMatch(/<QR[^>]*>A001-2<\/QR>/);
    expect(formOf(fake.calls[1]).get('content')).toContain('2/2');
  });

  it('按门店解析 SN，覆盖默认 SN', async () => {
    const fake = fakeFetch([{ body: { ret: 0, msg: 'ok', data: 'FEIE-SH' } }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT', storeSn: { 'sh-xuhui': 'SN-XUHUI' } });

    await printer.print(job());

    expect(formOf(fake.calls[0]).get('sn')).toBe('SN-XUHUI');
  });

  it('门店没配 SN 时诚实失败，不向飞鹅发请求', async () => {
    const fake = fakeFetch([]);
    const printer = build(fake.impl);

    const result = await printer.print(job());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/SN/);
    expect(fake.calls).toHaveLength(0);
  });

  it('飞鹅返回非 0 时带返回码与提示，不冒充打印成功', async () => {
    const fake = fakeFetch([
      { body: { ret: 1002, msg: '验证失败 : 打印机编号和用户不匹配.', data: null } }
    ]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1002/);
    expect(result.error).toMatch(/不匹配/);
  });

  it('部分标签失败时说明已下发张数，提示补打核对', async () => {
    const fake = fakeFetch([
      { body: { ret: 0, msg: 'ok', data: 'FEIE-1' } },
      { body: { ret: 1002, msg: '打印机编号和用户不匹配', data: null } }
    ]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job([{}, {}]));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/第 2\/2 张/);
    expect(result.error).toMatch(/已下发 1 张/);
  });

  it('网络异常返回可读错误，不抛到打印队列之外', async () => {
    const fake = fakeFetch([{ throws: 'connect ECONNREFUSED' }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    const result = await printer.print(job());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/飞鹅接口连接失败/);
  });

  it('商品名里的尖括号被转义，避免破坏标签排版', async () => {
    const fake = fakeFetch([{ body: { ret: 0, msg: 'ok', data: 'FEIE-1' } }]);
    const printer = build(fake.impl, { sn: 'SN-DEFAULT' });

    await printer.print(job([{ productName: '抹茶<特调>' }]));

    const content = formOf(fake.calls[0]).get('content') || '';
    expect(content).toContain('抹茶&lt;特调&gt;');
    expect(content).not.toContain('抹茶<特调>');
  });

  it('缺少 user 或 UKEY 时启动即失败，错误信息只提变量名不回显密钥', () => {
    expect(() => new FeieLabelPrinter({ user: '', ukey: 'u', sn: 'SN', storeSn: {}, apiBase: 'https://feie.test', timeoutMs: 10000, labelWidthMm: 40, labelHeightMm: 30, labelGap: '2,0' })).toThrow(/FEIE_USER/);
    expect(() => new FeieLabelPrinter({ user: 'u', ukey: '', sn: 'SN', storeSn: {}, apiBase: 'https://feie.test', timeoutMs: 10000, labelWidthMm: 40, labelHeightMm: 30, labelGap: '2,0' })).toThrow(/FEIE_UKEY/);
  });

  it('status 用 Open_queryPrinterStatus 返回在线/离线，未配 SN 时诚实离线', async () => {
    const online = fakeFetch([{ body: { ret: 0, msg: 'ok', data: '在线，工作状态正常' } }]);
    const offline = fakeFetch([{ body: { ret: 0, msg: 'ok', data: '离线' } }]);
    const missing = fakeFetch([]);

    const onlineStatus = await build(online.impl, { sn: 'SN-DEFAULT' }).status();
    const offlineStatus = await build(offline.impl, { sn: 'SN-DEFAULT' }).status();
    const missingStatus = await build(missing.impl).status();

    expect(onlineStatus.online).toBe(true);
    expect(offlineStatus.online).toBe(false);
    expect(offlineStatus.detail).toMatch(/离线/);
    expect(missingStatus.online).toBe(false);
    expect(missingStatus.detail).toMatch(/SN/);
    expect(formOf(online.calls[0]).get('apiname')).toBe('Open_queryPrinterStatus');
    expect(missing.calls).toHaveLength(0);
  });

  it('工厂只在显式声明 printer=live 时启用飞鹅，缺凭证时启动失败', () => {
    const live = loadIntegrationsConfig({
      uploadRoot: '/tmp/teahour-feie-test',
      assetUrl: (key) => `https://cdn.test/${key}`,
      env: {
        INTEGRATIONS_PRINTER_MODE: 'live',
        FEIE_USER: 'test-user',
        FEIE_UKEY: 'test-ukey',
        FEIE_SN: 'SN-DEFAULT',
        FEIE_STORE_SN: '{"sh-xuhui":"SN-XUHUI"}'
      }
    });
    const integrations = createIntegrations(live);
    expect(integrations.printer.name).toBe('feie-cloud-label');
    expect(integrations.printer.mode).toBe('live');
    expect(integrations.payment.mode).toBe('mock');

    const missing = loadIntegrationsConfig({
      uploadRoot: '/tmp/teahour-feie-test',
      assetUrl: (key) => `https://cdn.test/${key}`,
      env: { INTEGRATIONS_PRINTER_MODE: 'live' }
    });
    expect(() => createIntegrations(missing)).toThrow(/FEIE_USER/);
  });

  it('FEIE_STORE_SN 不是合法 JSON 时直接报错，避免把标签打到错误的机器', () => {
    expect(() =>
      loadIntegrationsConfig({
        uploadRoot: '/tmp/teahour-feie-test',
        assetUrl: (key) => `https://cdn.test/${key}`,
        env: { FEIE_STORE_SN: 'not-json' }
      })
    ).toThrow(/FEIE_STORE_SN/);
  });
});
