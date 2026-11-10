import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { ApiError } from '../common/errors';

/**
 * CRM → 轻疗内部支付接口。
 * 签名串：timestamp\nnonce\nMETHOD\nrequestURI(+?query)\nsha256hex(body)
 * 配置：CRM_RETREAT_BASE_URL / CRM_RETREAT_KEY_ID / CRM_RETREAT_SECRET，三者齐全才启用。
 * baseUrl 指向轻疗服务的对外根（例：https://mall-test.fullyu.cn/api），签名只覆盖 /crm-internal 相对路径。
 */
export type RetreatConfig = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs?: number;
};

export type RetreatRefundInput = {
  orderSn: string;
  refundCents: number;
  refundType: 'WITHIN_7D' | 'AFTER_7D' | 'PRORATED' | 'NEGOTIATED';
  reason?: string;
  operatorName?: string;
};

export type RetreatOrderView = {
  orderSn: string;
  productCode?: string;
  productName?: string;
  paidCents?: number;
  state?: number;
  stateText?: string;
  refundState?: string | null;
  refundType?: string | null;
  refundCents?: number | null;
  crmCardId?: string | null;
  crmRefunded?: number | null;
  payError?: string | null;
  refundable?: boolean;
  createTime?: string | null;
  payTime?: string | null;
  refundTime?: string | null;
};

export type RetreatRefundResult = RetreatOrderView & {
  crmRefunded?: boolean;
  replayed?: boolean;
  amountMismatch?: boolean;
};

export type RetreatUnlockResult = {
  customerId?: number;
  wasLocked?: boolean;
  unlocked?: boolean;
};

export type RetreatRetryResult = RetreatOrderView & { replayed?: boolean };

const normalizeBase = (value: string): string => value.trim().replace(/\/+$/, '');
const readTimeout = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 60_000 ? parsed : 8000;
};

export function retreatSign(
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  path: string,
  body: string
): string {
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  const signing = `${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`;
  return createHmac('sha256', secret).update(signing, 'utf8').digest('hex');
}

@Injectable()
export class RetreatPaymentClient {
  private readonly logger = new Logger(RetreatPaymentClient.name);
  private readonly config: RetreatConfig | null;

  constructor() {
    this.config = RetreatPaymentClient.fromEnv(process.env);
  }

  static fromEnv(env: NodeJS.ProcessEnv): RetreatConfig | null {
    const baseUrl = normalizeBase(env.CRM_RETREAT_BASE_URL || '');
    const keyId = (env.CRM_RETREAT_KEY_ID || '').trim();
    const secret = (env.CRM_RETREAT_SECRET || '').trim();
    if (!baseUrl || !keyId || !secret) return null;
    return { baseUrl, keyId, secret, timeoutMs: readTimeout(env.CRM_RETREAT_TIMEOUT_MS) };
  }

  /** 未配置时后台仍可查卡与手工发卡，只是不能代客退款/解锁。 */
  get enabled(): boolean {
    return this.config !== null;
  }

  order(orderSn: string): Promise<RetreatOrderView> {
    return this.call('GET', '/crm-internal/member-card/order', undefined, { orderSn });
  }

  refund(input: RetreatRefundInput): Promise<RetreatRefundResult> {
    return this.call('POST', '/crm-internal/member-card/refund', input);
  }

  retry(orderSn: string, kind: 'SETTLE' | 'CRM_REFUND'): Promise<RetreatRetryResult> {
    return this.call('POST', '/crm-internal/member-card/retry', { orderSn, kind });
  }

  unlock(phone: string): Promise<RetreatUnlockResult> {
    return this.call('POST', '/crm-internal/member-card/unlock', { phone });
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    const config = this.config;
    if (!config) {
      throw new ApiError(503, 'CRM 未配置轻疗内部支付密钥（CRM_RETREAT_*），暂不能调用轻疗退款或解锁', {
        code: 'RETREAT_NOT_CONFIGURED'
      });
    }
    const search = query ? new URLSearchParams(query).toString() : '';
    const signedPath = search ? `${path}?${search}` : path;
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(12).toString('hex');
    const signature = retreatSign(config.secret, timestamp, nonce, method, signedPath, raw);

    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}${signedPath}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-crm-key': config.keyId,
          'x-crm-timestamp': timestamp,
          'x-crm-nonce': nonce,
          'x-crm-signature': signature
        },
        body: body === undefined ? undefined : raw,
        signal: AbortSignal.timeout(config.timeoutMs || 8000)
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      this.logger.warn(`轻疗内部接口不可用 path=${signedPath} error=${name}`);
      throw new ApiError(503, '轻疗支付服务暂时不可用，请稍后重试；未发生任何资金变动', {
        code: 'RETREAT_UNAVAILABLE'
      });
    }

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    if (!response.ok) {
      const message =
        typeof record.message === 'string' && record.message.trim()
          ? record.message.trim()
          : '轻疗支付接口返回错误';
      const code = typeof record.error === 'string' ? record.error : 'RETREAT_ERROR';
      this.logger.warn(
        `轻疗内部接口失败 path=${signedPath} status=${response.status} code=${code}`
      );
      if (response.status === 404 && code === 'NOT_ENABLED') {
        throw new ApiError(503, '轻疗内部支付接口未开启，请联系轻疗运维配置 CRM_INTERNAL_ENABLED', {
          code: 'RETREAT_DISABLED'
        });
      }
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(502, '轻疗内部接口签名校验失败，请核对 CRM_RETREAT_* 配置', {
          code: 'RETREAT_UNAUTHORIZED'
        });
      }
      if (response.status === 409 || response.status === 400 || response.status === 404) {
        throw new ApiError(response.status, message, { code });
      }
      throw new ApiError(502, message, { code });
    }
    return (record as T) ?? ({} as T);
  }
}
