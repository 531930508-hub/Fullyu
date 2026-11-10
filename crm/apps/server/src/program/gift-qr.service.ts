import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ApiError, notFound } from '../common/errors';
import {
  GIFT_APP_TARGETS,
  giftScene,
  normalizeAppTarget,
  qrEnvVersion,
  type GiftAppTarget,
  type QrEnvVersion
} from './gift-qr';

interface TokenEntry {
  value: string;
  expiresAt: number;
}

export interface GiftQrResult {
  buffer: Buffer;
  filename: string;
  target: GiftAppTarget;
  envVersion: QrEnvVersion;
}

/**
 * 会员码小程序码。
 * - token 按 appid 缓存，提前 5 分钟过期；
 * - 微信返回 JSON 即失败（常见为未发布页面、密钥错误），不把二进制错误当图片；
 * - secret 只从环境读取，任何日志都不打印 token/secret。
 */
@Injectable()
export class GiftQrService {
  private readonly logger = new Logger('GiftQr');
  private readonly tokens = new Map<string, TokenEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async generate(campaignId: string, requestedEnv?: unknown): Promise<GiftQrResult> {
    const campaign = await this.prisma.giftCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw notFound('会员码活动不存在');

    let target: GiftAppTarget;
    try {
      target = normalizeAppTarget(campaign.appTarget);
    } catch {
      throw new ApiError(409, '该会员码的目标小程序配置无效，请重新编辑后再生成', {
        code: 'GIFT_APP_TARGET_INVALID'
      });
    }
    const config = GIFT_APP_TARGETS[target];
    const secret = (process.env[config.secretEnv] || '').trim();
    if (!secret) {
      throw new ApiError(503, `尚未配置${config.name}小程序密钥，暂不能生成小程序码`, {
        code: 'WX_NOT_CONFIGURED'
      });
    }
    const envVersion = qrEnvVersion(requestedEnv, process.env[config.sceneEnv]);
    const scene = giftScene(campaign.code);

    let buffer = await this.requestQr(config, secret, scene, envVersion, false);
    if (buffer === null || buffer === 'TOKEN_INVALID') {
      // access_token 可能被其他服务刷新失效，清缓存后重试一次。
      this.tokens.delete(config.appid);
      buffer = await this.requestQr(config, secret, scene, envVersion, true);
    }
    if (buffer === null || buffer === 'TOKEN_INVALID') {
      throw new ApiError(502, '微信小程序码生成失败，请稍后重试', { code: 'WX_QR_FAILED' });
    }

    return {
      buffer,
      filename: `gift-${campaign.code}-${target}-${envVersion}.png`,
      target,
      envVersion
    };
  }

  private async requestQr(
    config: { name: string; appid: string; page: string; secretEnv: string; sceneEnv: string },
    secret: string,
    scene: string,
    envVersion: QrEnvVersion,
    retried: boolean
  ): Promise<Buffer | null | 'TOKEN_INVALID'> {
    const token = await this.accessToken(config, secret);
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene,
          page: config.page,
          check_path: false,
          env_version: envVersion,
          width: 430,
          auto_color: false,
          line_color: { r: 58, g: 42, b: 26 },
          is_hyaline: true
        }),
        signal: AbortSignal.timeout(15000)
      }
    );
    const contentType = response.headers.get('content-type') || '';
    const payload = Buffer.from(await response.arrayBuffer());
    if (contentType.includes('application/json')) {
      let detail: { errcode?: number; errmsg?: string } = {};
      try {
        detail = JSON.parse(payload.toString('utf8')) as { errcode?: number; errmsg?: string };
      } catch {
        detail = {};
      }
      const errcode = Number(detail.errcode || 0);
      if (errcode === 40001 || errcode === 42001) {
        return retried ? null : 'TOKEN_INVALID';
      }
      this.logger.warn(
        `${config.name}小程序码生成失败：errcode=${errcode || '-'} errmsg=${detail.errmsg || '-'} env=${envVersion}`
      );
      return null;
    }
    if (!response.ok || payload.length === 0) {
      this.logger.warn(`${config.name}小程序码返回异常：HTTP ${response.status}`);
      return null;
    }
    return payload;
  }

  private async accessToken(
    config: { name: string; appid: string; secretEnv: string },
    secret: string
  ): Promise<string> {
    const cached = this.tokens.get(config.appid);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(
        config.appid
      )}&secret=${encodeURIComponent(secret)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    let body: { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      body = {};
    }
    if (!body.access_token) {
      // 只记录错误码，绝不打印请求 URL（含 secret）。
      this.logger.warn(
        `${config.name} access_token 获取失败：errcode=${body.errcode ?? '-'} errmsg=${body.errmsg ?? '-'}`
      );
      throw new ApiError(502, '微信接口暂不可用，请稍后重试', { code: 'WX_TOKEN_FAILED' });
    }
    const ttl = Math.max(60, Number(body.expires_in || 7200) - 300);
    this.tokens.set(config.appid, { value: body.access_token, expiresAt: Date.now() + ttl * 1000 });
    return body.access_token;
  }
}
