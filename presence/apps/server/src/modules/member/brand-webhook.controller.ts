import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { SkipThrottle } from '@nestjs/throttler'
import type { Request } from 'express'
import { readBrandMemberConfig } from '../../common/crm/brand-member.config'

/**
 * CRM 品牌卡事件接收（X-Fy 推送契约）。
 *
 * 只验签并确认收到，不写本地卡状态：会员页仍实时向 CRM 取数，
 * 重复/乱序投递不会改变业务结果，重试由 CRM 侧负责。
 */

const MAX_SKEW_SECONDS = 300

type RawRequest = Request & { rawBody?: Buffer | string }

export function signWebhook(
  secret: string,
  timestamp: string,
  nonce: string,
  path: string,
  rawBody: string,
): string {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\nPOST\n${path}\n${bodyHash}`, 'utf8')
    .digest('hex')
}

const header = (req: RawRequest, name: string): string => {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] || '' : String(value || '')
}

const safeEqual = (given: string, expected: string): boolean => {
  const a = Buffer.from(given, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

// CRM 补投时单轮可达 50 条、每分钟可超过全局限流阈值；推送已用签名鉴权，单独免限流。
@SkipThrottle()
@Controller('hooks')
export class BrandWebhookController {
  private readonly logger = new Logger('BrandWebhook')

  @Post('brand-card')
  @HttpCode(200)
  receive(@Req() req: RawRequest) {
    const config = readBrandMemberConfig({
      NODE_ENV: process.env.NODE_ENV,
      BRAND_CRM_ENABLED: process.env.BRAND_CRM_ENABLED,
      BRAND_CRM_BASE_URL: process.env.BRAND_CRM_BASE_URL,
      CRM_BASE_URL: process.env.CRM_BASE_URL,
      BRAND_CRM_KEY_ID: process.env.BRAND_CRM_KEY_ID,
      BRAND_CRM_SECRET: process.env.BRAND_CRM_SECRET,
      BRAND_CRM_TIMEOUT_MS: process.env.BRAND_CRM_TIMEOUT_MS,
    })
    if (!config) throw new ServiceUnavailableException('品牌会员推送未配置接收密钥')

    const keyId = header(req, 'x-fy-key')
    const timestamp = header(req, 'x-fy-timestamp')
    const nonce = header(req, 'x-fy-nonce')
    const signature = header(req, 'x-fy-signature')
    if (keyId !== config.keyId || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException('推送签名缺失或密钥不匹配')
    }

    const seconds = Number(timestamp)
    if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > MAX_SKEW_SECONDS) {
      throw new UnauthorizedException('推送时间戳超出允许范围')
    }

    const rawBody = req.rawBody ? req.rawBody.toString() : ''
    const path = req.originalUrl || ''
    const expected = signWebhook(config.secret, timestamp, nonce, path, rawBody)
    if (!safeEqual(signature, expected)) throw new UnauthorizedException('推送签名校验失败')

    let topic = ''
    let cardId = ''
    let memberNo = ''
    try {
      const payload = JSON.parse(rawBody) as {
        topic?: unknown
        cardId?: unknown
        memberNo?: unknown
      }
      topic = typeof payload.topic === 'string' ? payload.topic : ''
      cardId = typeof payload.cardId === 'string' ? payload.cardId : ''
      memberNo = typeof payload.memberNo === 'string' ? payload.memberNo : ''
    } catch {
      // 签名通过但内容不是合法 JSON：仍然确认收到，payload 结构由 CRM 侧保证。
    }
    this.logger.log(`收到 CRM 品牌卡事件 ${topic || '(无主题)'} ${cardId} ${memberNo}`.trim())
    return { ok: true }
  }
}
