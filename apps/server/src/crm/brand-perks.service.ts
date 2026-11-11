import { Injectable, Logger } from '@nestjs/common';
import { BrandMemberClient } from './brand-member.client';

/** CRM 未接入时沿用的本地每杯立减（分）。 */
export const DEFAULT_PER_CUP_CENTS = 200;

/** 缓存时长：CRM 改价后最迟 1 分钟生效。 */
const TTL_MS = 60_000;
/** 失败退避：CRM 异常时不至于每次请求都重试。 */
const FAIL_BACKOFF_MS = 10_000;
/** 单杯立减的合理上限（¥10），超出视为配置错误。 */
const MAX_PER_CUP_CENTS = 1000;

/**
 * 时叙会员权益参数，唯一来源是 CRM 年卡版本的 perks.teahour.perCupCents。
 *
 * - 未接入 CRM：沿用本地默认 200 分，保持单机/测试环境行为；
 * - 已接入 CRM：读取失败时沿用最近一次下发值，从未拿到过则按 0 处理（宁可少减，不能凭空多减）。
 */
@Injectable()
export class BrandPerksService {
  private readonly logger = new Logger('BrandPerks');
  private cached: number | null = null;
  private expiresAt = 0;
  private inflight: Promise<number> | null = null;

  constructor(private readonly client: BrandMemberClient) {}

  /** 年卡每杯立减（分）；资格由本地会籍判定，金额由 CRM 下发。 */
  async perCupCents(): Promise<number> {
    if (!this.client.enabled) return DEFAULT_PER_CUP_CENTS;
    // 成功后在 TTL 内直接复用；失败后在退避窗口内直接复用（无历史值时即为 0）。
    if (Date.now() < this.expiresAt) return this.cached ?? 0;
    if (!this.inflight) {
      this.inflight = this.load().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async load(): Promise<number> {
    try {
      const { products } = await this.client.products();
      const annual = products.find((product) => product.code === 'FY_ANNUAL');
      const value = readPerCupCents(annual?.perks);
      this.cached = value;
      this.expiresAt = Date.now() + TTL_MS;
      return value;
    } catch (error) {
      this.expiresAt = Date.now() + FAIL_BACKOFF_MS;
      const reason = error instanceof Error ? error.message : String(error);
      if (this.cached !== null) {
        this.logger.warn(`CRM 每杯立减读取失败，沿用最近一次下发值 ${this.cached} 分：${reason}`);
        return this.cached;
      }
      this.logger.error(`CRM 每杯立减读取失败且无历史值，暂按 0 分处理：${reason}`);
      return 0;
    }
  }
}

/** 从卡版本 perks 中取 teahour.perCupCents；缺失或越界一律按 0。 */
function readPerCupCents(perks: Record<string, unknown> | undefined): number {
  const teahour = perks?.teahour;
  if (!teahour || typeof teahour !== 'object') return 0;
  const raw = (teahour as Record<string, unknown>).perCupCents;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > MAX_PER_CUP_CENTS) {
    return 0;
  }
  return raw;
}