/**
 * 芯烨 XP-420B 的「门店打印代理」链路（服务端侧）。
 *
 * 机器是 USB 的，云端只能把渲染好的 TSPL 放进队列等门店电脑来取：
 *   - 下单后任务必须停在 queued，订单 printStatus 不能提前变 printed（不许假成功）；
 *   - 领取是原子的、只认本店，跨店令牌拿不到别人的杯贴；
 *   - 只有代理回执 ok 之后订单才算真打印；失败走退避，三次转死信；
 *   - 代理崩溃留下的 processing 任务在租约过期后能被同店重新领走。
 */
import { CUP_LABEL_LAYOUT } from '@teahour/integrations';
import { createHarness, freshOrderBody, type Harness } from '../testing/harness';
import { PrintingService } from '../printing/printing.service';

const TOKEN_SH = 'sh-agent-token-0123456789';
const TOKEN_BJ = 'bj-agent-token-0123456789';
const LEASE_MS = 5 * 60_000;

type AgentJob = { jobId: string; orderNumber: string; labels: Array<{ label: string; tspl: string }> };

/** 杯贴是逐字发 TEXT 的：按 y 把这一行的字拼回文字，方便断言内容。 */
const glyphsAt = (tspl: string, y: number): string =>
  [...tspl.matchAll(new RegExp(`^TEXT \\d+,${y},"[^"]*",0,1,1,"(.*)"$`, 'gm'))]
    .map((matched) => matched[1])
    .join('');

describe('门店打印代理（芯烨 XP-420B / agent 模式）', () => {
  let h: Harness;
  let printing: PrintingService;

  const place = async () => {
    const customer = await h.customer('打印代理茶客');
    const res = await h.api('post', '/customer/orders', customer.token, {
      ...freshOrderBody(),
      type: 'takeaway',
      seat: null
    });
    if (res.status !== 201) throw new Error(`下单失败 ${res.status} ${res.text}`);
    return res.body.order as { id: string; number: string };
  };

  const claimFor = (token: string) =>
    h.api('post', '/print-agent/claim', null, undefined).set('x-print-agent-token', token);

  const ack = (jobId: string, body: { ok: boolean; error?: string }, token = TOKEN_SH) =>
    h.api('post', `/print-agent/jobs/${jobId}/result`, null, body).set('x-print-agent-token', token);

  /** 领到指定订单的任务；途中的别的订单顺手打完，避免用例之间串单。 */
  const claimOrder = async (orderNumber?: string, token = TOKEN_SH): Promise<AgentJob | null> => {
    for (let i = 0; i < 10; i += 1) {
      const res = await claimFor(token);
      expect(res.status).toBe(200);
      const job = res.body.job as AgentJob | null;
      if (!job) return null;
      if (!orderNumber || job.orderNumber === orderNumber) return job;
      await ack(job.jobId, { ok: true });
    }
    throw new Error('队列里任务过多，未能领到目标订单');
  };

  beforeAll(async () => {
    // 只有这个用例组需要真实驱动：打印机走 agent（live），令牌与电话由用例自己给，
    // 不依赖本机 .env；harness 的默认 mock 配置在 options.env 之后应用。
    h = await createHarness({
      env: {
        INTEGRATIONS_PRINTER_MODE: 'live',
        PRINTER_DRIVER: 'agent',
        PRINT_AGENT_TOKENS: JSON.stringify({ sh: TOKEN_SH, 'bj-east': TOKEN_BJ }),
        TEAHOUR_SERVICE_PHONE: 'TEL 021-5466 8899'
      }
    });
    printing = h.app.get(PrintingService);
  });

  afterAll(async () => {
    await h.close();
  });

  it('下单后任务停在队列里，订单不会被提前标成已打印', async () => {
    const order = await place();
    const job = await h.prisma.printJob.findFirst({ where: { orderId: order.id, kind: 'labels' } });
    expect(job?.status).toBe('queued');
    const row = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.printStatus).toBe('queued');

    // process() 在 agent 模式不得真去推指令，也不得改状态
    const result = await printing.process(job!.id);
    expect(result.ok).toBe(true);
    const after = await h.prisma.printJob.findUnique({ where: { id: job!.id } });
    expect(after?.status).toBe('queued');
  });

  it('代理领到的是渲染好的 TSPL：取餐号、杯贴码二维码、品名都在', async () => {
    const order = await place();
    const job = (await claimOrder(order.number))!;
    const tspl = job.labels[0].tspl;
    expect(job.labels).toHaveLength(1);
    expect(tspl).toContain('SIZE 40 mm,60 mm');
    expect(tspl).toMatch(/QRCODE \d+,\d+,M,5,A,0,"[A-Z]\d{3}-1"/);
    // 杯贴是逐字发 TEXT 的，所以按行把字拼回来再断言
    expect(glyphsAt(tspl, CUP_LABEL_LAYOUT.eyebrow.y)).toBe('取餐号');
    expect(glyphsAt(tspl, CUP_LABEL_LAYOUT.tel.y)).toBe('TEL021-54668899');
    // 只印门店名，不带城市前缀（库里 name 是「上海·西岸店」，short 是「西岸店」）
    expect(glyphsAt(tspl, CUP_LABEL_LAYOUT.store.y)).toBe('西岸店');

    const row = await h.prisma.printJob.findUnique({ where: { id: job.jobId } });
    expect(row?.status).toBe('processing');
    expect(row?.claimedAt).toBeTruthy();
    await ack(job.jobId, { ok: true });
  });

  it('回执 ok 之后才算打印完成', async () => {
    const order = await place();
    const job = (await claimOrder(order.number))!;
    const res = await ack(job.jobId, { ok: true });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const row = await h.prisma.printJob.findUnique({ where: { id: job.jobId } });
    expect(row?.status).toBe('printed');
    const fresh = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh?.printStatus).toBe('printed');
  });

  it('没有令牌或令牌不对一律 401，不给杯贴内容', async () => {
    const noToken = await h.api('post', '/print-agent/claim', null, undefined);
    expect(noToken.status).toBe(401);
    const badToken = await claimFor('not-a-real-token');
    expect(badToken.status).toBe(401);
  });

  it('令牌绑定门店：北京店令牌领不到上海店的杯贴，也回执不了', async () => {
    const order = await place();
    const bjClaim = await claimFor(TOKEN_BJ);
    expect(bjClaim.status).toBe(200);
    expect(bjClaim.body.job).toBeNull();

    const shJob = (await claimOrder(order.number))!;
    expect(shJob).toBeTruthy();
    const stolen = await ack(shJob.jobId, { ok: true }, TOKEN_BJ);
    expect(stolen.status).toBe(200);
    expect(stolen.body.ok).toBe(false);
    expect(stolen.body.error).toContain('不属于本门店');

    const row = await h.prisma.printJob.findUnique({ where: { id: shJob.jobId } });
    expect(row?.status).toBe('processing');
    // 收尾：让本店代理把这单正常打完，别把 processing 留给后续用例
    await ack(shJob.jobId, { ok: true });
    expect((await h.prisma.order.findUnique({ where: { id: order.id } }))?.printStatus).toBe('printed');
  });

  it('代理报失败：回队列并记原因，三次后转死信，订单标记打印失败', async () => {
    const order = await place();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const job = (await claimOrder(order.number))!;
      const res = await ack(job.jobId, { ok: false, error: '缺纸/卡纸' });
      expect(res.status).toBe(200);
      const row = await h.prisma.printJob.findUnique({ where: { id: job.jobId } });
      expect(row?.attempts).toBe(attempt);
      expect(row?.lastError).toContain('缺纸');
    }
    const dead = await h.prisma.printJob.findFirst({ where: { orderId: order.id, kind: 'labels' } });
    expect(dead?.status).toBe('dead');
    expect((await h.prisma.order.findUnique({ where: { id: order.id } }))?.printStatus).toBe('failed');
    const log = await h.prisma.log.findFirst({ where: { orderId: order.id, action: { contains: '死信' } } });
    expect(log).toBeTruthy();
  });

  it('代理崩溃留下的任务：租约内不重复出纸，过期后能被同店重新领走', async () => {
    const order = await place();
    const first = (await claimOrder(order.number))!;

    // 还没过期：这张仍在 processing，本店再领不应拿到它
    const beforeExpiry = await claimOrder(order.number);
    expect(beforeExpiry).toBeNull();

    await h.prisma.printJob.update({
      where: { id: first.jobId },
      data: { claimedAt: new Date(Date.now() - LEASE_MS - 1000) }
    });
    const again = (await claimOrder(order.number))!;
    expect(again.jobId).toBe(first.jobId);
    await ack(again.jobId, { ok: true });
    expect((await h.prisma.order.findUnique({ where: { id: order.id } }))?.printStatus).toBe('printed');
  });

  it('自检接口只回门店与传输方式，不泄漏令牌或任务内容', async () => {
    const res = await h.api('get', '/print-agent/health', null).set('x-print-agent-token', TOKEN_SH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, storeId: 'sh', transport: true });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN_SH);
  });
});