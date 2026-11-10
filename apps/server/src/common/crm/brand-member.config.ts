/**
 * 品牌会员（CRM）接入配置（在场）。
 *
 * - 未配置地址与密钥且未显式开关时关闭，会员页只展示本地数据；
 * - 开启后品牌卡/积分/愈行之旅以 CRM 为唯一账本，调用失败必须报错，不回退假数据；
 * - 密钥只从环境变量读取，不写入源码、日志或测试快照。
 */
import { ConfigService } from '@nestjs/config'

export interface BrandCrmConfig {
  baseUrl: string
  keyId: string
  secret: string
  timeoutMs: number
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])
const FALSY = new Set(['0', 'false', 'no', 'off'])
const KEY_ID = /^[A-Za-z0-9._:-]{1,64}$/

const isProduction = (env: Record<string, string | undefined>): boolean =>
  (env.NODE_ENV || '').trim().toLowerCase() === 'production'

const fail = (message: string): never => {
  throw new Error(`[config] ${message}`)
}

export function readBrandMemberConfig(
  env: Record<string, string | undefined>,
): BrandCrmConfig | null {
  const flag = (env.BRAND_CRM_ENABLED || '').trim().toLowerCase()
  const baseUrl = (env.BRAND_CRM_BASE_URL || env.CRM_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '')

  if (FALSY.has(flag)) return null
  if (!TRUTHY.has(flag) && !baseUrl) return null

  if (!baseUrl) fail('已开启品牌会员，但缺少 BRAND_CRM_BASE_URL')
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) fail('BRAND_CRM_BASE_URL 必须是 http(s) 地址')
  if (
    isProduction(env) &&
    !/^https:/i.test(baseUrl) &&
    !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(baseUrl)
  ) {
    fail('生产环境的 BRAND_CRM_BASE_URL 必须使用 HTTPS（本机回环地址除外）')
  }

  const keyId = (env.BRAND_CRM_KEY_ID || '').trim()
  if (!KEY_ID.test(keyId)) fail('已开启品牌会员，但 BRAND_CRM_KEY_ID 缺失或格式不正确')

  const secret = (env.BRAND_CRM_SECRET || '').trim()
  if (secret.length < 16) fail('已开启品牌会员，但 BRAND_CRM_SECRET 缺失或少于 16 位')

  const parsedTimeout = Number((env.BRAND_CRM_TIMEOUT_MS || '').trim())
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? Math.min(15_000, Math.max(300, Math.round(parsedTimeout)))
      : 3000

  return { baseUrl, keyId, secret, timeoutMs }
}

export function brandMemberConfigFrom(config: ConfigService): BrandCrmConfig | null {
  return readBrandMemberConfig({
    NODE_ENV: config.get<string>('NODE_ENV'),
    BRAND_CRM_ENABLED: config.get<string>('BRAND_CRM_ENABLED'),
    BRAND_CRM_BASE_URL: config.get<string>('BRAND_CRM_BASE_URL'),
    CRM_BASE_URL: config.get<string>('CRM_BASE_URL'),
    BRAND_CRM_KEY_ID: config.get<string>('BRAND_CRM_KEY_ID'),
    BRAND_CRM_SECRET: config.get<string>('BRAND_CRM_SECRET'),
    BRAND_CRM_TIMEOUT_MS: config.get<string>('BRAND_CRM_TIMEOUT_MS'),
  })
}
