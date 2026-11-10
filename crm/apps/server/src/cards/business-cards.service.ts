import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  businessName,
  fromExternalBusiness,
  isBusiness,
  toExternalBusiness
} from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { audit } from '../common/audit';
import { badRequest, notFound } from '../common/errors';
import type { StaffContext } from '../common/auth.types';

const CARD_STATUS = new Set(['ACTIVE', 'HIDDEN']);
const IMMUTABLE = ['sourceSystem', 'readOnly', 'sellableInCrm'] as const;

export type BusinessCardUpdate = {
  name?: string;
  benefit?: string;
  description?: string;
  managePath?: string;
  status?: string;
  sort?: number;
};

function normalizeQueryBusiness(value?: string): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  if (isBusiness(raw)) return raw;
  const mapped = fromExternalBusiness(raw);
  if (!mapped) throw badRequest(`未知业务：${value}`);
  return mapped;
}

@Injectable()
export class BusinessCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(business?: string) {
    const normalized = normalizeQueryBusiness(business);
    const rows = await this.prisma.businessCardCatalog.findMany({
      where: normalized ? { business: normalized } : undefined,
      orderBy: [{ business: 'asc' }, { sort: 'asc' }, { cardCode: 'asc' }]
    });
    return rows.map((row) => this.toDto(row));
  }

  async update(
    business: string,
    cardCode: string,
    input: BusinessCardUpdate,
    actor: StaffContext
  ) {
    for (const field of IMMUTABLE) {
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        throw badRequest('来源系统、只读与售卖归属由系统维护，不能通过接口修改');
      }
    }
    const normalized = normalizeQueryBusiness(business);
    if (!normalized) throw badRequest('缺少业务标识');
    const row = await this.prisma.businessCardCatalog.findUnique({
      where: { business_cardCode: { business: normalized, cardCode } }
    });
    if (!row) throw notFound('业务会员卡不存在');

    const data: Prisma.BusinessCardCatalogUpdateInput = {};
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (name.length < 1 || name.length > 30) throw badRequest('卡名称须为 1–30 个字符');
      data.name = name;
    }
    if (input.benefit !== undefined) {
      const benefit = String(input.benefit).trim();
      if (benefit.length < 1 || benefit.length > 120) {
        throw badRequest('权益说明须为 1–120 个字符');
      }
      data.benefit = benefit;
    }
    if (input.description !== undefined) {
      const description = String(input.description).trim();
      if (description.length > 300) throw badRequest('补充说明不能超过 300 个字符');
      data.description = description;
    }
    if (input.managePath !== undefined) {
      const path = String(input.managePath).trim();
      if (path.length > 200) throw badRequest('管理路径不能超过 200 个字符');
      data.managePath = path;
    }
    if (input.status !== undefined) {
      if (!CARD_STATUS.has(input.status)) throw badRequest('状态只能是 ACTIVE 或 HIDDEN');
      data.status = input.status;
    }
    if (input.sort !== undefined) {
      if (!Number.isInteger(input.sort) || input.sort < -9999 || input.sort > 9999) {
        throw badRequest('排序须为 -9999–9999 的整数');
      }
      data.sort = input.sort;
    }
    if (Object.keys(data).length === 0) throw badRequest('没有可更新的字段');

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.businessCardCatalog.update({
        where: { business_cardCode: { business: normalized, cardCode } },
        data
      });
      await audit(tx, {
        actor,
        action: '更新业务会员卡目录',
        target: `${normalized}:${cardCode}`,
        detail: JSON.stringify(data)
      });
      return result;
    });
    return this.toDto(updated);
  }

  private toDto(row: {
    business: string;
    cardCode: string;
    name: string;
    benefit: string;
    description: string;
    sourceSystem: string;
    readOnly: boolean;
    sellableInCrm: boolean;
    managePath: string;
    status: string;
    sort: number;
    updatedAt: Date;
  }) {
    return {
      business: row.business,
      businessKey: toExternalBusiness(row.business),
      businessName: businessName(row.business),
      cardCode: row.cardCode,
      name: row.name,
      benefit: row.benefit,
      description: row.description,
      sourceSystem: row.sourceSystem,
      readOnly: row.readOnly,
      sellableInCrm: row.sellableInCrm,
      managePath: row.managePath,
      status: row.status,
      sort: row.sort,
      updatedAt: row.updatedAt
    };
  }
}
