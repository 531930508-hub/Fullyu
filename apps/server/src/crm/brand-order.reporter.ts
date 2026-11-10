import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BrandMemberClient, BrandResponseError } from './brand-member.client';

const TICK_MS = 60_000;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 50;
/** 顾客在 CRM 尚无档案时（未同步/未建档）先退避一小时，避免每分钟重复打扰。 */
const MEMBER_MISSING_BACKOFF_MS = 60 * 60 * 1000;

export type BrandOrderReportResult = { reported: number; refunded: number; skipped: number; failed: number };

/**
 * 把已付款茶饮/零售订单的实付与累计退款上报给 Full愈 CRM，用于「每满 ¥300 得一颗骰子」。
 *
 * - 订单表是唯一持久来源：只扫最近 7 天已付款、有顾客、实付 > 0 的订单；
 * - CRM 按 orderRef 幂等（同额重放成功、改额 409），退款按累计金额上报，
 *   所以进程重启后重复上报不会多发骰子；内存指纹只用来省掉无变化的请求；
 * - 任一失败都不记指纹，下一轮继续；服务不可用时整批停下，不把失败当成功。
 * - 时叙目前没有会员价，savedCents 固定 0；接入会员权益后再按实际优惠上报。
 */
@Injectable()
export class BrandOrderReporter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BrandOrderReporter');
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly sent = new Map<string, string>();
  private readonly backoff = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly brand: BrandMemberClient
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
    if (!this.switchedOn()) return;
    if (!this.brand.enabled) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 默认关闭：需在环境里显式开启 BRAND_ORDER_REPORT_ENABLED=1。 */
  private switchedOn(): boolean {
    return ['1', 'true', 'on'].includes(String(process.env.BRAND_ORDER_REPORT_ENABLED || '').toLowerCase());
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.runOnce(new Date());
      if (result.reported || result.refunded || result.failed) {
        this.logger.log(
          `订单上报：新增 ${result.reported}、退款 ${result.refunded}、失败 ${result.failed}`
        );
      }
    } catch (error) {
      this.logger.error(`订单上报失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** 单轮上报；测试直接调用。 */
  async runOnce(now: Date): Promise<BrandOrderReportResult> {
    const result: BrandOrderReportResult = { reported: 0, refunded: 0, skipped: 0, failed: 0 };
    if (!this.brand.enabled) return result;
    const orders = await this.prisma.order.findMany({
      where: {
        // 退款只累加 refundedCents、不改 paymentStatus，所以已退款订单仍在 paid 内。
        paymentStatus: 'paid',
        customerId: { not: null },
        totalCents: { gt: 0 },
        paidAt: { gte: new Date(now.getTime() - WINDOW_MS) }
      },
      orderBy: { paidAt: 'asc' },
      select: { id: true, customerId: true, totalCents: true, refundedCents: true, paidAt: true },
      take: 500
    });

    let attempts = 0;
    for (const order of orders) {
      if (attempts >= BATCH) break;
      const customerId = order.customerId as string;
      const refunded = Math.min(Math.max(0, order.refundedCents || 0), order.totalCents);
      const fingerprint = `${order.totalCents}:${refunded}`;
      if (this.sent.get(order.id) === fingerprint) {
        result.skipped += 1;
        continue;
      }
      const until = this.backoff.get(customerId);
      if (until && until > now.getTime()) {
        result.skipped += 1;
        continue;
      }
      attempts += 1;
      try {
        await this.brand.reportOrder(customerId, {
          orderRef: order.id,
          paidCents: order.totalCents,
          savedCents: 0,
          occurredAt: (order.paidAt as Date).toISOString()
        });
        result.reported += 1;
        if (refunded > 0) {
          await this.brand.refundOrder(customerId, {
            orderRef: order.id,
            refundCents: refunded,
            occurredAt: now.toISOString()
          });
          result.refunded += 1;
        }
        this.sent.set(order.id, fingerprint);
        this.backoff.delete(customerId);
      } catch (error) {
        result.failed += 1;
        const code = this.errorCode(error);
        if (code === 'MEMBER_NOT_FOUND') {
          this.backoff.set(customerId, now.getTime() + MEMBER_MISSING_BACKOFF_MS);
          continue;
        }
        if (error instanceof BrandResponseError && error.status >= 400 && error.status < 500) {
          // 契约类错误（如金额冲突）逐单记录，不阻塞其他订单；下一轮仍会重试。
          this.logger.warn(`订单 ${order.id} 上报被拒：HTTP ${error.status} ${code}`.trim());
          continue;
        }
        // 服务不可用 / 网络异常：整批停下，下一轮再来。
        this.logger.warn(`品牌会员 CRM 暂不可用，本轮订单上报中止（${code || '未知'}）`);
        break;
      }
    }
    // 窗口外的订单不会再被扫描，清理指纹避免内存无限增长。
    const live = new Set(orders.map((order) => order.id));
    for (const id of this.sent.keys()) if (!live.has(id)) this.sent.delete(id);
    return result;
  }

  private errorCode(error: unknown): string {
    if (error instanceof BrandResponseError) {
      const payload = error.payload && typeof error.payload === 'object' ? (error.payload as Record<string, unknown>) : {};
      return typeof payload.error === 'string' ? payload.error : '';
    }
    if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }
    return '';
  }
}
