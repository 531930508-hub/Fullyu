/**
 * TX-06 打印任务认领/租约/死信整改。
 *
 * 审计口径（06-整改台账.csv）：打印任务与订单事务解耦，意图在事务内写入；
 * 认领/租约 + 超时恢复；失败退避、死信与人工补打都有审计。
 */
import {
  ACCOUNTS,
  createHarness,
  freshOrderBody,
  type Harness
} from '../testing/harness';
import { PrintingService } from '../printing/printing.service';

const LEASE_MS = 5 * 60_000;

describe('打印任务认领与恢复（TX-06）', () => {
  let h: Harness;
  let managerToken: string;

  const setPrinter = (status: string) =>
    h.prisma.store.update({ where: { id: 'sh' }, data: { printerStatus: status } });

  const place = async () => {
    const res = await h.api('post', '/customer/orders', (await h.customer('打印茶客')).token, {
      ...freshOrderBody(),
      type: 'takeaway',
      seat: null
    });
    if (res.status !== 201) throw new Error(`下单失败 ${res.status} ${res.text}`);
    return res.body.order as { id: string };
  };

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
  });

  afterAll(async () => {
    await h.close();
  });

  it('TX-06 重复处理同一打印任务幂等：已打印不再重复出票', async () => {
    const order = await place();
    const job = await h.prisma.printJob.findFirst({ where: { orderId: order.id, kind: 'labels' } });
    expect(job?.status).toBe('printed');
    const attemptsAfterFirst = job?.attempts ?? 0;

    const printing = h.app.get(PrintingService);
    const again = await printing.process(job!.id);
    expect(again.ok).toBe(true);

    const after = await h.prisma.printJob.findUnique({ where: { id: job!.id } });
    expect(after?.status).toBe('printed');
    expect(after?.attempts).toBe(attemptsAfterFirst);
  });

  it('TX-06 打印机离线重试耗尽转死信并留痕', async () => {
    await setPrinter('offline');
    const order = await place();
    const job = await h.prisma.printJob.findFirst({ where: { orderId: order.id, kind: 'labels' } });
    expect(job?.status).toBe('queued');
    expect(job?.attempts).toBe(1);
    expect(job?.lastError).toContain('离线');

    const printing = h.app.get(PrintingService);
    await printing.process(job!.id);
    await printing.process(job!.id);

    const dead = await h.prisma.printJob.findUnique({ where: { id: job!.id } });
    expect(dead?.status).toBe('dead');
    expect(dead?.attempts).toBe(3);
    const fresh = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh?.printStatus).toBe('failed');

    const log = await h.prisma.log.findFirst({ where: { orderId: order.id, action: { contains: '死信' } } });
    expect(log).toBeTruthy();
    expect(log?.type).toBe('print');

    await setPrinter('online');
    // 死信任务不再自动处理，必须走人工补打重建
    const blocked = await printing.process(job!.id);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/死信|补打/);
  });

  it('TX-06 租约超时的任务可被安全恢复', async () => {
    const order = await place();
    const job = await h.prisma.printJob.findFirst({ where: { orderId: order.id, kind: 'labels' } });
    expect(job?.status).toBe('printed');

    // 模拟节点在打印中崩溃：任务卡在 processing 且租约早已过期
    await h.prisma.printJob.update({
      where: { id: job!.id },
      data: { status: 'processing', claimedAt: new Date(Date.now() - LEASE_MS * 2) }
    });

    const printing = h.app.get(PrintingService);
    const recovered = await printing.process(job!.id);
    expect(recovered.ok).toBe(true);

    const after = await h.prisma.printJob.findUnique({ where: { id: job!.id } });
    expect(after?.status).toBe('printed');
  });

  it('TX-06 启动扫描恢复积压的排队任务', async () => {
    await setPrinter('offline');
    const order = await place();
    let job = await h.prisma.printJob.findFirst({ where: { orderId: order.id, kind: 'labels' } });
    expect(job?.status).toBe('queued');

    await setPrinter('online');
    const recovered = await h.app.get(PrintingService).resumeQueued();
    expect(recovered).toBeGreaterThanOrEqual(1);

    job = await h.prisma.printJob.findUnique({ where: { id: job!.id } });
    expect(job?.status).toBe('printed');
    const fresh = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh?.printStatus).toBe('printed');
  });

  it('TX-06 人工补打重建任务并有审计日志', async () => {
    await setPrinter('offline');
    const order = await place();
    await h.prisma.printJob.updateMany({ where: { orderId: order.id }, data: { attempts: 3, status: 'dead' } });

    await setPrinter('online');
    const reprint = await h.api('post', `/store/orders/${order.id}/reprint`, managerToken, {});
    expect(reprint.status).toBe(201);
    expect(reprint.body.ok).toBe(true);

    const jobs = await h.prisma.printJob.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
    expect(jobs.some((x) => x.kind === 'reprint' && x.status === 'printed')).toBe(true);

    const log = await h.prisma.log.findFirst({ where: { orderId: order.id, action: '补打杯贴' } });
    expect(log).toBeTruthy();
    await setPrinter('online');
  });
});
