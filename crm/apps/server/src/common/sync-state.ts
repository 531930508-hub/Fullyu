import type { Business } from '@fullyu/crm-shared';
import type { PrismaService } from './prisma.service';

/**
 * 记录业务端最近一次通过签名校验的调用。
 *
 * `/v1/brand-member/*`（品牌卡）与 `/external/*`（会员、积分、资料）是两套入口，
 * 都代表「这个端还活着」，必须一起写，否则只调积分的端会被首页误判成从未接入、
 * 滞后无限增长。
 */
export const touchBusinessSyncState = (
  prisma: PrismaService,
  business: Business,
  path: string,
  now = new Date()
) =>
  prisma.businessSyncState.upsert({
    where: { business },
    create: { business, lastSeenAt: now, lastPath: path },
    update: { lastSeenAt: now, lastPath: path }
  });
