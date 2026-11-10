import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { brandMemberConfig } from '../crm/brand-member.config';

/**
 * CRM 品牌卡事件接收（X-Fy 推送契约）。
 *
 * 只做三件事：验签、按业务日志留痕、确认收到。
 * 会员页仍实时向 CRM 取数，这里不落本地卡状态，也不做任何写操作，
 * 因此重复投递、乱序投递都不会改变业务结果；重试由 CRM 侧负责。
 */

const MAX_SKEW_SECONDS = 300;

type RawRequest = Request & { rawBody?: string };

export function signWebhook(
  secret: string,
  timestamp: string,
  nonce: string,
  path: string,
  rawBody: string
): string {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\nPOST\n${path}\n${bodyHash}`, 'utf8')
    .digest('hex');
}

const header = (req: RawRequest, name: string): string => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] || '' : String(value || '');
};

const safeEqual = (given: string, expected: string): boolean => {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};

@Controller('hooks')
export class CrmWebhookController {
  private readonly logger = new Logger('CrmWebhook');

  @Post('brand-card')
  @HttpCode(200)
  receive(@Req() req: RawRequest) {
    const config = brandMemberConfig();
    if (!config) {
      throw new ServiceUnavailableException('品牌会员推送未配置接收密钥');
    }

    const keyId = header(req, 'x-fy-key');
    const timestamp = header(req, 'x-fy-timestamp');
    const nonce = header(req, 'x-fy-nonce');
    const signature = header(req, 'x-fy-signature');
    if (keyId !== config.keyId || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException('推送签名缺失或密钥不匹配');
    }

    const seconds = Number(timestamp);
    if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > MAX_SKEW_SECONDS) {
      throw new UnauthorizedException('推送时间戳超出允许范围');
    }

    const rawBody = req.rawBody ?? '';
    const path = req.originalUrl || '';
    const expected = signWebhook(config.secret, timestamp, nonce, path, rawBody);
    if (!safeEqual(signature, expected)) {
      throw new UnauthorizedException('推送签名校验失败');
    }

    let topic = '';
    let cardId = '';
    let memberNo = '';
    try {
      const payload = JSON.parse(rawBody) as {
        topic?: unknown;
        cardId?: unknown;
        memberNo?: unknown;
      };
      topic = typeof payload.topic === 'string' ? payload.topic : '';
      cardId = typeof payload.cardId === 'string' ? payload.cardId : '';
      memberNo = typeof payload.memberNo === 'string' ? payload.memberNo : '';
    } catch {
      // 签名通过但内容不是合法 JSON：仍然确认收到，由 CRM 侧保证 payload 结构。
    }
    this.logger.log(`收到 CRM 品牌卡事件 ${topic || '(无主题)'} ${cardId} ${memberNo}`.trim());
    return { ok: true };
  }
}
