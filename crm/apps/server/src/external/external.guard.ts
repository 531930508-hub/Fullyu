import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { Business } from '@fullyu/crm-shared';
import { externalClients, type ExternalClient } from './external.clients';
import { unauthorized } from '../common/errors';

export const MAX_SKEW_SECONDS = 300;

export type ExternalContext = { keyId: string; business: Business };
export type ExternalRequest = RawBodyRequest<Request> & { external?: ExternalContext };

export const signPayload = (
  secret: string,
  timestamp: string,
  method: string,
  url: string,
  rawBody: string
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${method.toUpperCase()}\n${url}\n${bodyHash}`, 'utf8')
    .digest('hex');
};

/**
 * 业务端签名：x-crm-key / x-crm-timestamp / x-crm-signature。
 * 签名覆盖时间戳、方法、完整路径（含 /api 前缀与查询串）与请求体哈希。
 * 时间窗 ±5 分钟；写接口另以 ref 幂等，防重放造成重复入账。
 */
@Injectable()
export class ExternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ExternalRequest>();
    const keyId = String(request.headers['x-crm-key'] || '');
    const timestamp = String(request.headers['x-crm-timestamp'] || '');
    const signature = String(request.headers['x-crm-signature'] || '');
    if (!keyId || !timestamp || !signature) throw unauthorized('缺少外部接口签名头');

    const clients = externalClients();
    const client: ExternalClient | undefined = clients.get(keyId);
    if (!client) throw unauthorized('外部接口密钥不可用');

    const seconds = Number(timestamp);
    if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > MAX_SKEW_SECONDS) {
      throw unauthorized('签名时间戳超出允许范围');
    }

    const rawBody = request.rawBody ? request.rawBody.toString('utf8') : '';
    const expected = signPayload(
      client.secret,
      timestamp,
      request.method,
      request.originalUrl,
      rawBody
    );
    const given = Buffer.from(signature, 'utf8');
    const want = Buffer.from(expected, 'utf8');
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      throw unauthorized('外部接口签名不正确');
    }

    request.external = { keyId, business: client.business };
    return true;
  }
}
