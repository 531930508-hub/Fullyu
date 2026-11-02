import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { HardwareService } from '../hardware/hardware.module';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';

/** 重试上限：超过后转死信，等待人工补打（补打会重建任务并留痕）。 */
const MAX_ATTEMPTS = 3;
/** 处理租约：领取超时未回写视为节点崩溃，可被安全恢复。 */
const LEASE_MS = 5 * 60_000;

@Injectable()
export class PrintingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hardware: HardwareService
  ) {}

  /** 启动时恢复积压任务：崩溃/离线遗留的 queued 与超时 processing 都会被重新认领。 */
  async onModuleInit(): Promise<void> {
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
    const payload = {
      orderId: order.id,
      orderNumber: order.number,
      storeId: order.storeId,
      reprint,
      labels: printable.map((unit) => ({
        label: unit.label,
        orderNumber: order.number,
        storeName: store?.name || order.storeId,
        productName: unit.item.name,
        temp: unit.item.temp,
        ice: unit.item.ice,
        cupIndex: order.units.findIndex((x) => x.id === unit.id) + 1,
        cupTotal: order.units.length,
        printedAt: new Date().toISOString()
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
