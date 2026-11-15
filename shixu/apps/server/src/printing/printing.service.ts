import { Injectable, OnModuleInit } from '@nestjs/common';
import { buildTsplJob, type PrintJobPayload } from '@teahour/integrations';
import { PrismaService } from '../common/prisma.service';
import { HardwareService } from '../hardware/hardware.module';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';
import { servicePhone, tsplLabelStyle } from '../config/config';

/** 重试上限：超过后转死信，等待人工补打（补打会重建任务并留痕）。 */
const MAX_ATTEMPTS = 3;
/** 处理租约：领取超时未回写视为节点崩溃，可被安全恢复。 */
const LEASE_MS = 5 * 60_000;

/** 交给门店打印代理的一张标签：TSPL 已经渲染好，代理只负责转码与写 USB。 */
export type AgentLabel = { label: string; tspl: string };

/** 代理领取到的任务。label 与杯贴码一一对应，避免打错杯。 */
export type AgentPrintJob = {
  jobId: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  reprint: boolean;
  labels: AgentLabel[];
};

@Injectable()
export class PrintingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hardware: HardwareService
  ) {}

  /** 芯烨 XP-420B 这类 USB 机只能由门店代理领取，服务端不推指令。 */
  get agentTransport(): boolean {
    return this.hardware.printer.transport === 'agent';
  }

  /** 启动时恢复积压任务：崩溃/离线遗留的 queued 与超时 processing 都会被重新认领。 */
  async onModuleInit(): Promise<void> {
    // agent 模式下没有任何可推的通道，积压交给门店代理领取，不做空转重试。
    if (this.agentTransport) return;
    await this.resumeQueued().catch(() => undefined);
  }

  async enqueue(orderId: string, reprint = false): Promise<string | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        units: { include: { item: true }, orderBy: { label: 'asc' } }
      }
    });
    if (!order || !order.units.length) return null;
    // TX-05：已退杯不进入打印内容；杯次序号与总数保持原单口径，便于对位。
    const printable = order.units.filter((unit) => unit.status !== 'refunded');
    if (!printable.length) return null;
    const store = await this.prisma.store.findUnique({ where: { id: order.storeId } });
    // 称呼只取昵称，绝不把手机号或全名印在吧台人人可见的杯贴上。
    const customer = order.customerId
      ? await this.prisma.customer.findUnique({ where: { id: order.customerId }, select: { name: true } })
      : null;
    const orderedAt = (order.paidAt || order.createdAt).toISOString();
    const payload: PrintJobPayload = {
      orderId: order.id,
      orderNumber: order.number,
      storeId: order.storeId,
      reprint,
      labels: printable.map((unit) => ({
        label: unit.label,
        orderNumber: order.number,
        // 杯贴只印门店名，不带城市前缀：「西岸店」而不是「上海·西岸店」。
        // 城市在纸上是废话——杯贴永远只在本店出，省下的宽度留给店名本身。
        storeName: store?.short || store?.name || order.storeId,
        productName: unit.item.name,
        temp: unit.item.temp,
        ice: unit.item.ice,
        cupIndex: order.units.findIndex((x) => x.id === unit.id) + 1,
        cupTotal: order.units.length,
        printedAt: new Date().toISOString(),
        pickupCode: order.pickupCode || undefined,
        series: unit.item.series,
        customerName: customer?.name || undefined,
        storePhone: servicePhone() || undefined,
        orderedAt
      }))
    };
    // 稳定业务键：同一订单的自动出票任务只允许一条（TX-06 outbox 口径）；
    // 补打任务每次独立编号，可重复发起且有审计。
    const businessKey = reprint
      ? `order:${orderId}:reprint:${newId('R').slice(-6)}`
      : `order:${orderId}:initial`;
    if (!reprint) {
      const existing = await this.prisma.printJob.findUnique({ where: { businessKey } });
      if (existing) return existing.id;
    }
    const id = newId('PJ');
    const now = new Date();
    await this.prisma.printJob.create({
      data: {
        id,
        orderId,
        kind: reprint ? 'reprint' : 'labels',
        payloadJson: JSON.stringify(payload),
        status: 'queued',
        attempts: 0,
        businessKey,
        createdAt: now,
        updatedAt: now
      }
    });
    await this.prisma.order.update({ where: { id: orderId }, data: { printStatus: 'queued' } });
    return id;
  }

  async process(jobId: string): Promise<{ ok: boolean; error?: string }> {
    // agent 模式（芯烨 XP-420B）：任务留在 queued，等门店打印代理用令牌领取。
    // 这里绝不返回「已打印」——吧台没出纸之前，订单 printStatus 必须还是 queued。
    if (this.agentTransport) return { ok: true };
    // 租约恢复：卡在 processing 且租约过期的任务先回到队列。
    await this.prisma.printJob.updateMany({
      where: { id: jobId, status: 'processing', claimedAt: { lt: new Date(Date.now() - LEASE_MS) } },
      data: { status: 'queued', claimedAt: null, updatedAt: new Date() }
    });
    // 原子认领：并发调用只有一个能从 queued 改为 processing。
    const claimed = await this.prisma.printJob.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'processing', claimedAt: new Date(), updatedAt: new Date() }
    });
    if (!claimed.count) {
      const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
      if (job?.status === 'printed') return { ok: true };
      if (job?.status === 'dead') return { ok: false, error: '打印任务已转死信，请使用补打重建任务' };
      return { ok: false, error: '打印任务正在处理中' };
    }

    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job) return { ok: false, error: '打印任务不存在' };
    const order = await this.prisma.order.findUnique({ where: { id: job.orderId } });
    if (!order) {
      await this.failJob(job.id, '订单不存在', true);
      return { ok: false, error: '订单不存在' };
    }
    const store = await this.prisma.store.findUnique({ where: { id: order.storeId } });
    if (!store || store.printerStatus !== 'online') {
      return this.failJob(job.id, '门店标签机离线');
    }
    try {
      const payload = JSON.parse(job.payloadJson);
      const result = await this.hardware.printer.print(payload);
      if (!result.ok) throw new Error(result.error || '打印失败');
      await this.prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: 'printed',
          attempts: { increment: 1 },
          claimedAt: null,
          lastError: null,
          updatedAt: new Date()
        }
      });
      await this.prisma.order.update({ where: { id: order.id }, data: { printStatus: 'printed' } });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failJob(job.id, message);
    }
  }

  /** 失败退避：未达上限回队列等下次扫描，达到上限转死信并留审计日志。 */
  private async failJob(jobId: string, message: string, terminal = false): Promise<{ ok: boolean; error: string }> {
    const job = await this.prisma.printJob.update({
      where: { id: jobId },
      data: { attempts: { increment: 1 }, updatedAt: new Date() }
    });
    const dead = terminal || job.attempts >= MAX_ATTEMPTS;
    await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: dead ? 'dead' : 'queued',
        claimedAt: null,
        lastError: message,
        updatedAt: new Date()
      }
    });
    if (dead) {
      await this.prisma.order.update({ where: { id: job.orderId }, data: { printStatus: 'failed' } });
      await logAction(this.prisma, {
        actorName: '打印服务',
        action: '打印转死信',
        detail: `${job.kind} · 尝试 ${job.attempts} 次 · ${message}`,
        type: 'print',
        orderId: job.orderId
      });
    } else {
      await this.prisma.order.update({ where: { id: job.orderId }, data: { printStatus: 'queued' } });
    }
    return { ok: false, error: message };
  }

  /** 扫描恢复：把排队/租约过期的任务重新处理一遍（启动时与必要时手动触发）。 */
  async resumeQueued(): Promise<number> {
    if (this.agentTransport) return 0;
    const jobs = await this.prisma.printJob.findMany({
      where: { status: { in: ['queued', 'processing'] } },
      orderBy: { createdAt: 'asc' },
      take: 50
    });
    let recovered = 0;
    for (const job of jobs) {
      const result = await this.process(job.id);
      if (result.ok) recovered += 1;
    }
    return recovered;
  }

  /**
   * 门店打印代理领取一张待打杯贴（芯烨 XP-420B 走这里）。
   *
   * - 只领本店任务；服务端把 TSPL 渲染好，代理只做转码 + 写 USB，避免两端版本漂移；
   * - 认领是原子的（queued → processing），多个收银工位同时轮询不会重复出纸；
   * - 租约过期（代理崩溃/关机）的任务会被这家店的代理重新领走，不需要人工介入。
   */
  async claimForAgent(storeId: string): Promise<AgentPrintJob | null> {
    await this.prisma.printJob.updateMany({
      where: {
        status: 'processing',
        claimedAt: { lt: new Date(Date.now() - LEASE_MS) },
        order: { storeId }
      },
      data: { status: 'queued', claimedAt: null, updatedAt: new Date() }
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const job = await this.prisma.printJob.findFirst({
        where: { status: 'queued', order: { storeId } },
        orderBy: { createdAt: 'asc' }
      });
      if (!job) return null;
      const claimed = await this.prisma.printJob.updateMany({
        where: { id: job.id, status: 'queued' },
        data: { status: 'processing', claimedAt: new Date(), updatedAt: new Date() }
      });
      if (!claimed.count) continue; // 被同店另一个工位抢走了，继续找下一张

      const order = await this.prisma.order.findUnique({ where: { id: job.orderId } });
      if (!order) {
        await this.failJob(job.id, '订单不存在', true);
        continue;
      }
      const payload = JSON.parse(job.payloadJson) as PrintJobPayload;
      return {
        jobId: job.id,
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        reprint: job.kind === 'reprint',
        labels: buildTsplJob(payload, tsplLabelStyle())
      };
    }
    return null;
  }

  /** 代理回执「已出纸」：只有这一步会把订单标成 printed；只认领自己门店的任务。 */
  async complete(jobId: string, storeId: string): Promise<{ ok: boolean; error?: string }> {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: { order: { select: { id: true, storeId: true } } }
    });
    if (!job) return { ok: false, error: '打印任务不存在' };
    if (job.order.storeId !== storeId) return { ok: false, error: '该任务不属于本门店' };
    await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: 'printed',
        attempts: { increment: 1 },
        claimedAt: null,
        lastError: null,
        updatedAt: new Date()
      }
    });
    await this.prisma.order.update({ where: { id: job.orderId }, data: { printStatus: 'printed' } });
    return { ok: true };
  }

  /** 代理回执「打不出来」：按退避重试，三次后转死信等人工补打。 */
  async reject(jobId: string, message: string, storeId: string): Promise<{ ok: boolean; error: string }> {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: { order: { select: { storeId: true } } }
    });
    if (!job) return { ok: false, error: '打印任务不存在' };
    if (job.order.storeId !== storeId) return { ok: false, error: '该任务不属于本门店' };
    return this.failJob(jobId, message.slice(0, 300));
  }

  async list(storeId?: string) {
    const rows = await this.prisma.printJob.findMany({
      where: storeId ? { order: { storeId } } : undefined,
      include: { order: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return rows.map((row) => {
      const payload = JSON.parse(row.payloadJson) as { labels?: unknown[] };
      return {
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.number,
        storeId: row.order.storeId,
        kind: row.kind,
        status: row.status,
        attempts: row.attempts,
        lastError: row.lastError,
        labels: payload.labels?.length || 0,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime()
      };
    });
  }
}
