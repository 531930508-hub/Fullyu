import { Injectable } from '@nestjs/common';
import { BUSINESSES, type Business } from '@fullyu/crm-shared';
import type { Member, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PointsService } from '../points/points.service';
import { audit } from '../common/audit';
import { badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { runIdempotent } from '../common/idempotency';
import { normalizePhone } from '../common/phone';
import type { ExternalContext } from './external.guard';

export type ResolveInput = {
  localUserId: string;
  unionId?: string | null;
  openId?: string | null;
  appId?: string | null;
  phone?: string | null;
  name?: string | null;
  gender?: number | null;
  birthday?: string | null;
  avatarUrl?: string | null;
};

export type PointChangeInput = {
  localUserId: string;
  points: number;
  reason: string;
  ref: string;
};

const LOCAL_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const REF = /^[A-Za-z0-9._:-]{1,64}$/;

const businessName = (business: Business): string =>
  BUSINESSES.find((item) => item.key === business)?.name || business;

const actorOf = (business: Business, context: ExternalContext) => ({
  id: `ext:${business}:${context.keyId}`,
  name: `${businessName(business)} 外部接口`
});

/**
 * 三端接入：身份以 unionId 优先、手机号次之匹配，CRM 为唯一会员与积分账本。
 * - 业务端只传自己的本地用户 id，不传会员号；
 * - 同一个人跨业务命中同一会员，各业务各留一条身份；
 * - unionId 与手机号分别命中不同会员时拒绝自动合并，交人工处理。
 */
@Injectable()
export class ExternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService
  ) {}

  async resolve(input: ResolveInput, context: ExternalContext) {
    const data = this.normalizeResolve(input);
    const result = await this.resolveOne(data, context.business, true);
    return {
      memberId: result.member.id,
      memberNo: result.member.memberNo,
      name: result.member.name,
      balance: await this.points.balance(result.member.id),
      created: result.created,
      bound: result.bound
    };
  }

  async getByLocalUser(localUserId: string, context: ExternalContext) {
    this.assertLocalId(localUserId);
    const identity = await this.prisma.memberIdentity.findUnique({
      where: { business_localUserId: { business: context.business, localUserId } },
      include: { member: true }
    });
    if (!identity) throw notFound('该本地用户尚未同步到 CRM');
    return {
      memberId: identity.member.id,
      memberNo: identity.member.memberNo,
      name: identity.member.name,
      status: identity.member.status,
      balance: await this.points.balance(identity.member.id)
    };
  }

  async importMembers(inputs: ResolveInput[], context: ExternalContext) {
    const list = Array.isArray(inputs) ? inputs : [];
    if (!list.length) throw badRequest('导入列表不能为空');
    if (list.length > 500) throw badRequest('单次最多导入 500 条');
    const summary = { created: 0, bound: 0, unchanged: 0, failed: [] as { localUserId: string; reason: string }[] };
    for (const raw of list) {
      let data: ReturnType<ExternalService['normalizeResolve']>;
      try {
        data = this.normalizeResolve(raw);
      } catch (error) {
        summary.failed.push({
          localUserId: String(raw?.localUserId || ''),
          reason: error instanceof Error ? error.message : '参数不合法'
        });
        continue;
      }
      try {
        const result = await this.resolveOne(data, context.business, false);
        if (!result.member.phone) {
          summary.failed.push({ localUserId: data.localUserId, reason: '缺少手机号' });
          continue;
        }
        if (result.created) summary.created += 1;
        else if (result.bound) summary.bound += 1;
        else summary.unchanged += 1;
      } catch (error) {
        summary.failed.push({
          localUserId: data.localUserId,
          reason: error instanceof Error ? error.message : '同步失败'
        });
      }
    }
    await audit(this.prisma, {
      actor: actorOf(context.business, context),
      action: '外部导入会员',
      target: context.keyId,
      detail: `新建 ${summary.created} · 绑定 ${summary.bound} · 已存在 ${summary.unchanged} · 失败 ${summary.failed.length}`
    });
    return summary;
  }

  async earn(input: PointChangeInput, context: ExternalContext) {
    return this.change(input, context, 1);
  }

  async consume(input: PointChangeInput, context: ExternalContext) {
    return this.change(input, context, -1);
  }

  private async change(input: PointChangeInput, context: ExternalContext, direction: 1 | -1) {
    const localUserId = this.requireString(input?.localUserId, 'localUserId', 64);
    this.assertLocalId(localUserId);
    const points = input?.points;
    if (!Number.isInteger(points) || points <= 0 || points > 1_000_000) {
      throw badRequest('积分必须为 1–1000000 的整数');
    }
    const ref = this.requireString(input?.ref, 'ref', 64);
    if (!REF.test(ref)) throw badRequest('ref 只能包含字母、数字与 . _ : -');
    const reason = (input?.reason || '').trim();
    if (!reason || reason.length > 100) throw badRequest('请填写 1–100 字的原因');

    const identity = await this.prisma.memberIdentity.findUnique({
      where: { business_localUserId: { business: context.business, localUserId } },
      include: { member: true }
    });
    if (!identity) throw notFound('该本地用户尚未同步到 CRM');
    const member = identity.member;
    if (member.status !== 'ACTIVE') throw badRequest('该会员不是有效状态，不能调整积分');

    const idemKey = `ext:${context.business}:${ref}`;
    const result = await runIdempotent(
      this.prisma,
      idemKey,
      { business: context.business, localUserId, points, direction, ref },
      async () => {
        const applied = await this.prisma.$transaction(async (tx) => {
          const [row] = await this.points.apply(
            tx,
            [{ memberId: member.id, points: direction * points, note: reason }],
            {
              business: context.business,
              ref,
              operatorId: `ext:${context.business}`,
              operatorName: businessName(context.business),
              note: reason,
              idemPrefix: idemKey
            }
          );
          return row;
        });
        await audit(this.prisma, {
          actor: actorOf(context.business, context),
          action: direction > 0 ? '外部积分入账' : '外部积分扣减',
          target: member.memberNo,
          detail: `${direction > 0 ? '+' : '-'}${points} · ${reason} · ${ref}`
        });
        return { balance: applied.balance, ledgerId: applied.ledgerId, memberNo: member.memberNo };
      }
    );
    return result;
  }

  private async resolveOne(
    input: ReturnType<ExternalService['normalizeResolve']>,
    business: Business,
    auditCreate: boolean,
    attempt = 1
  ): Promise<{ member: Member; created: boolean; bound: boolean }> {
    const existing = await this.prisma.memberIdentity.findUnique({
      where: { business_localUserId: { business, localUserId: input.localUserId } },
      include: { member: true }
    });
    if (existing) {
      const member = await this.touchMissingProfile(existing.member, input, existing.id);
      return { member, created: false, bound: false };
    }

    const byUnion = input.unionId
      ? (
          await this.prisma.memberIdentity.findFirst({
            where: { unionId: input.unionId, member: { status: 'ACTIVE' } },
            include: { member: true }
          })
        )?.member || null
      : null;
    const byPhone = input.phone
      ? await this.prisma.member.findUnique({ where: { phone: input.phone } })
      : null;
    if (byUnion && byPhone && byUnion.id !== byPhone.id) {
      throw conflict('该微信身份与手机号分属两个会员，需在 CRM 人工合并', {
        code: 'IDENTITY_CONFLICT',
        members: [byUnion.memberNo, byPhone.memberNo]
      });
    }

    const target = byUnion || byPhone;
    if (target) {
      try {
        await this.prisma.memberIdentity.create({
          data: {
            id: newId('MI'),
            business,
            localUserId: input.localUserId,
            appId: input.appId,
            openId: input.openId,
            unionId: input.unionId,
            memberId: target.id
          }
        });
      } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
          const raced = await this.prisma.memberIdentity.findUnique({
            where: { business_localUserId: { business, localUserId: input.localUserId } },
            include: { member: true }
          });
          if (raced) return { member: raced.member, created: false, bound: false };
        }
        throw error;
      }
      const member = await this.touchMissingProfile(target, input, null);
      if (auditCreate) {
        await audit(this.prisma, {
          actor: { id: `ext:${business}`, name: `${businessName(business)} 外部接口` },
          action: '绑定会员身份',
          target: member.memberNo,
          detail: `${business} · ${input.localUserId}`
        });
      }
      return { member, created: false, bound: true };
    }

    if (!input.phone) {
      throw badRequest(input.invalidPhone ? '手机号格式不正确' : '缺少手机号，手机号是会员唯一身份');
    }
    let created: Member;
    try {
      created = await this.createMember(input, business);
    } catch (error) {
      // 并发创建同一手机号：唯一约束兜底，重查一次并绑定到已存在的会员。
      if ((error as { code?: string })?.code === 'P2002' && attempt < 2) {
        return this.resolveOne(input, business, auditCreate, attempt + 1);
      }
      throw error;
    }
    if (auditCreate) {
      await audit(this.prisma, {
        actor: { id: `ext:${business}`, name: `${businessName(business)} 外部接口` },
        action: '外部新建会员',
        target: created.memberNo,
        detail: `${business} · ${input.localUserId}`
      });
    }
    return { member: created, created: true, bound: false };
  }

  private async createMember(input: ReturnType<ExternalService['normalizeResolve']>, business: Business) {
    return this.prisma.$transaction(async (tx) => {
      const memberNo = await nextMemberNo(tx);
      const member = await tx.member.create({
        data: {
          id: newId('MEM'),
          memberNo,
          phone: input.phone,
          name: input.name || '会员',
          gender: input.gender,
          birthday: input.birthday ? new Date(input.birthday) : null,
          avatarUrl: input.avatarUrl
        }
      });
      await tx.memberIdentity.create({
        data: {
          id: newId('MI'),
          business,
          localUserId: input.localUserId,
          appId: input.appId,
          openId: input.openId,
          unionId: input.unionId,
          memberId: member.id
        }
      });
      return member;
    });
  }

  /** 首次绑定时补齐 CRM 缺失的资料；已有值不被外部覆盖，避免两端来回改。 */
  private async touchMissingProfile(
    member: Member,
    input: ReturnType<ExternalService['normalizeResolve']>,
    identityId: string | null
  ) {
    const data: Prisma.MemberUpdateInput = {};
    if (!member.phone && input.phone) data.phone = input.phone;
    if (member.phone) {
      const canonical = normalizePhone(member.phone);
      if (canonical && canonical !== member.phone) data.phone = canonical;
    }
    if ((member.name === '会员' || !member.name) && input.name) data.name = input.name;
    if (member.gender === null && input.gender) data.gender = input.gender;
    if (!member.birthday && input.birthday) data.birthday = new Date(input.birthday);
    if (!member.avatarUrl && input.avatarUrl) data.avatarUrl = input.avatarUrl;
    if (identityId && (input.openId || input.unionId || input.appId)) {
      await this.prisma.memberIdentity.update({
        where: { id: identityId },
        data: {
          openId: input.openId ?? undefined,
          unionId: input.unionId ?? undefined,
          appId: input.appId ?? undefined
        }
      });
    }
    if (!Object.keys(data).length) return member;
    try {
      return await this.prisma.member.update({
        where: { id: member.id },
        data: { ...data, profileVersion: { increment: 1 } }
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw conflict('该手机号已属于另一个会员，需在 CRM 人工合并', {
          code: 'PHONE_CONFLICT',
          phone: data.phone
        });
      }
      throw error;
    }
  }

  private normalizeResolve(input: ResolveInput) {
    const localUserId = this.requireString(input?.localUserId, 'localUserId', 64);
    this.assertLocalId(localUserId);
    const rawPhone = this.optionalString(input?.phone, 32);
    const phone = normalizePhone(rawPhone);
    // 已同步身份的历史脏数据不能让整条同步失败；只有新建会员时才要求手机号有效。
    const invalidPhone = Boolean(rawPhone && !phone);
    const unionId = this.optionalString(input?.unionId, 64);
    const openId = this.optionalString(input?.openId, 64);
    const appId = this.optionalString(input?.appId, 64);
    const name = this.optionalString(input?.name, 20);
    const avatarUrl = this.optionalString(input?.avatarUrl, 500);
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) throw badRequest('头像必须是 http(s) 地址');
    const gender = input?.gender ?? null;
    if (gender !== null && gender !== 1 && gender !== 2) throw badRequest('性别只能是 1、2 或空');
    const birthday = this.optionalString(input?.birthday, 10);
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) throw badRequest('生日格式应为 YYYY-MM-DD');
    if (birthday && new Date(`${birthday}T00:00:00+08:00`).getTime() > Date.now()) {
      throw badRequest('生日不能晚于今天');
    }
    return {
      localUserId,
      phone,
      invalidPhone,
      unionId,
      openId,
      appId,
      name,
      avatarUrl,
      gender,
      birthday
    };
  }

  private assertLocalId(value: string) {
    if (!LOCAL_ID.test(value)) throw badRequest('localUserId 只能包含字母、数字与 . _ : -');
  }

  private requireString(value: unknown, field: string, max: number): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw badRequest(`缺少 ${field}`);
    if (text.length > max) throw badRequest(`${field} 过长`);
    return text;
  }

  private optionalString(value: unknown, max: number): string | null {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (text.length > max) throw badRequest(`字段长度不能超过 ${max}`);
    return text;
  }
}

/** 会员号形如 FY-2611-000123；按月递增，不复用。 */
export async function nextMemberNo(tx: Prisma.TransactionClient): Promise<string> {
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const yy = String(shanghai.getUTCFullYear()).slice(2);
  const mm = String(shanghai.getUTCMonth() + 1).padStart(2, '0');
  const counter = `member:${yy}${mm}`;
  const row = await tx.counter.upsert({
    where: { name: counter },
    create: { name: counter, value: 1 },
    update: { value: { increment: 1 } }
  });
  return `FY-${yy}${mm}-${String(row.value).padStart(6, '0')}`;
}
