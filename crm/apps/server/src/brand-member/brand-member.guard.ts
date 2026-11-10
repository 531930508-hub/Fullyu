import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { Business } from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { ApiError } from '../common/errors';
import { externalClients } from '../external/external.clients';

export const FY_MAX_SKEW_SECONDS = 300;
export const FY_NONCE_TTL_MS = 10 * 60 * 1000;

export type BrandMemberContext = { keyId: string; business: Business };
export type BrandMemberRequest = RawBodyRequest<Request> & { fy?: BrandMemberContext };

/**
 * 三端品牌会员签名串：
 * timestamp\nnonce\nMETHOD\n完整路径（含 /api 与查询串）\nsha256hex(rawBody)
 * 密钥只从 CRM_EXT_KEYS 注入，不入库、不进源码。
 */
export const signFyPayload = (
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  url: string,
  rawBody: string
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${url}\n${bodyHash}`, 'utf8')
    .digest('hex');
};

const invalid = (message: string) =>
  new ApiError(401, message, { code: 'INVALID_SIGNATURE' });

@Injectable()
export class BrandMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BrandMemberRequest>();
    const keyId = String(request.headers['x-fy-key'] || '').trim();
    const timestamp = String(request.headers['x-fy-timestamp'] || '').trim();
    const nonce = String(request.headers['x-fy-nonce'] || '').trim();
    const signature = String(request.headers['x-fy-signature'] || '').trim();
    if (!keyId || !timestamp || !nonce || !signature) {
      throw invalid('缺少 X-Fy 签名头');
    }
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(nonce)) {
      throw invalid('X-Fy-Nonce 格式不正确');
    }

    const client = externalClients().get(keyId);
    if (!client) throw invalid('外部接口密钥不可用');

    const seconds = Number(timestamp);
    if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > FY_MAX_SKEW_SECONDS) {
      throw invalid('签名时间戳超出允许范围');
    }

    const rawBody = request.rawBody ? request.rawBody.toString('utf8') : '';
    const expected = signFyPayload(
      client.secret,
      timestamp,
      nonce,
      request.method,
      request.originalUrl,
      rawBody
    );
    const given = Buffer.from(signature, 'utf8');
    const want = Buffer.from(expected, 'utf8');
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      throw invalid('签名不正确');
    }

    const now = new Date();
    try {
      // 过期 nonce 顺手清理，表只保留一个时间窗内的记录。
      await this.prisma.apiNonce.deleteMany({ where: { expireAt: { lt: now } } });
      await this.prisma.apiNonce.create({
        data: {
          keyId,
          nonce,
          expireAt: new Date(now.getTime() + FY_NONCE_TTL_MS)
        }
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ApiError(409, '该签名已被使用，请换新的 nonce', { code: 'REPLAYED' });
      }
      throw error;
    }

    request.fy = { keyId, business: client.business };
    await this.prisma.businessSyncState.upsert({
      where: { business: client.business },
      create: {
        business: client.business,
        lastSeenAt: now,
        lastPath: request.path
      },
      update: { lastSeenAt: now, lastPath: request.path }
    });
    return true;
  }
}
