import { randomInt } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { StaffService } from './staff.service';
import { HardwareService } from '../hardware/hardware.module';
import { ApiError, badRequest, tooManyRequests, unauthorized } from '../common/errors';
import { newId, dayStamp } from '../common/ids';
import { logAction } from '../common/logs';
import { mapCustomer, mapStaffSummary } from '../common/mappers';
import { LoginAttemptLimiter } from './login-attempts';
import { loginRateLimit } from '../config/config';
import { CrmClient, type CrmIdentity } from '../crm/crm.client';

export type CustomerSessionInput = {
  memberCode?: string;
  name?: string;
  phone?: string;
};

/** 顾客档案行 + CRM 身份字段；积分展示以 CRM 为准，本地 points 仅在未接入时使用。 */
type CrmCustomer = Parameters<typeof customerPayload>[0] & {
  unionId?: string | null;
  openId?: string | null;
};

/** 微信返回的这些 code 表示登录/手机号授权 code 已用过或过期，需要顾客重新授权。 */
const WECHAT_EXPIRED_CODES = new Set([40029, 40163, 41008]);
/** 微信接口分钟级频率限制。 */
const WECHAT_RATE_LIMIT_CODES = new Set([45011]);

@Injectable()
export class AuthService {
  private readonly wechatLogger = new Logger('WechatAuth');
  /** 后台登录失败计数：按「来源 IP + 账号」隔离，成功登录清零。 */
  private readonly loginAttempts = new LoginAttemptLimiter(loginRateLimit());

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly staffService: StaffService,
    private readonly hardware: HardwareService,
    private readonly crm: CrmClient
  ) {}

  async login(username: string, password: string, sourceIp = 'unknown') {
    const attemptKey = `${sourceIp}|${username.trim().toLowerCase()}`;
    const retryAfterMs = this.loginAttempts.retryAfterMs(attemptKey);
    if (retryAfterMs > 0) {
      // 锁定期间即使密码正确也拒绝：否则限流对暴力破解没有意义。
      const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
      throw tooManyRequests(`登录尝试过于频繁，请 ${minutes} 分钟后再试`);
    }
    const row = await this.prisma.user.findUnique({ where: { username } });
    if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
      this.loginAttempts.recordFailure(attemptKey);
      throw unauthorized('账号或密码不正确');
    }
    if (!row.active) {
      this.loginAttempts.recordFailure(attemptKey);
      throw unauthorized('账号已停用，请联系管理员');
    }
    const staff = await this.staffService.load(row.id);
    if (!staff) {
      this.loginAttempts.recordFailure(attemptKey);
      throw unauthorized('账号不存在');
    }
    this.loginAttempts.clear(attemptKey);
    const token = await this.jwt.signAsync(
      { kind: 'staff', sub: staff.id, ver: row.tokenVersion },
      { expiresIn: '12h' }
    );
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '登录后台',
      detail: staff.username,
      type: 'auth'
    });
    return { token, staff: mapStaffSummary(staff) };
  }

  async me(staffId: string) {
    const staff = await this.staffService.load(staffId);
    if (!staff) throw unauthorized();
    return { staff: mapStaffSummary(staff) };
  }

  /**
   * H5 预览 / 隔离测试用的手机号会话：仅 mock 适配层开放，必须带合法手机号。
   * 手机号是顾客唯一身份，同一号码永远回到同一顾客，不会新建空白档案。
   */
  async createCustomerSession(input: CustomerSessionInput) {
    if (this.hardware.wechat.mode !== 'mock') {
      throw badRequest('请使用手机号授权登录');
    }
    const phone = normalizePhone(input?.phone);
    const customer = await this.upsertCustomerByPhone(phone, { name: input?.name });
    const token = await this.jwt.signAsync(
      { kind: 'customer', sub: customer.id, ver: customer.sessionVersion },
      { expiresIn: '30d' }
    );
    return { token, customer: await this.customerView(customer) };
  }

  /**
   * 微信小程序登录：wx.login 的 code 换 openId，微信手机号授权换手机号。
   * 手机号是唯一身份：同一手机号无论换几次微信授权都回到同一顾客；
   * 没有手机号就没有登录态，也不再提供「先匿名登录、以后再绑」的路径。
   */
  async createWechatSession(input: {
    code?: string;
    phoneCode?: string;
    phone?: string;
    name?: string;
  }) {
    const code = String(input.code || '').trim();
    let openId: string | undefined;
    let unionId: string | undefined;
    if (code) {
      const session = await this.callWechat('login', () => this.hardware.wechat.code2Session(code));
      openId = session.openId;
      unionId = session.unionId;
    }

    // 显式手机号只允许在 mock 适配层（H5 预览 / 隔离测试）使用；真实环境必须走微信授权。
    if (input.phone && this.hardware.wechat.mode !== 'mock') {
      throw badRequest('请使用手机号授权登录');
    }
    let phone = input.phone ? normalizePhone(input.phone) : '';
    if (!phone && input.phoneCode) {
      if (!openId) throw badRequest('请先完成登录，再授权手机号');
      const result = await this.callWechat('phone', () =>
        this.hardware.wechat.phoneNumber({
          openId,
          code: input.phoneCode
        })
      );
      phone = normalizePhone(result.phone, result.countryCode);
    }
    if (!phone) throw badRequest('请使用手机号登录，手机号是会员唯一身份');

    const customer = await this.upsertCustomerByPhone(phone, {
      name: input.name,
      openId,
      unionId
    });
    const token = await this.jwt.signAsync(
      { kind: 'customer', sub: customer.id, ver: customer.sessionVersion },
      { expiresIn: '30d' }
    );
    return { token, customer: await this.customerView(customer), provider: this.hardware.wechat.mode };
  }

  /**
   * 手机号是唯一身份：按号码找顾客，openId 只作为渠道绑定跟随更新。
   * 若同一 openId 之前挂在别的顾客下（例如换号），旧档案解绑，身份以手机号为准。
   */
  private async upsertCustomerByPhone(
    phone: string,
    profile: { name?: string; openId?: string; unionId?: string } = {}
  ) {
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    const name = profile.name ? String(profile.name).trim().slice(0, 30) : '';
    if (profile.openId) {
      await this.prisma.customer.updateMany({
        where: { openId: profile.openId, NOT: { id: existing?.id ?? '' } },
        data: { openId: null }
      });
    }
    if (existing) {
      return this.prisma.customer.update({
        where: { id: existing.id },
        data: {
          ...(profile.openId
            ? { openId: profile.openId, unionId: profile.unionId ?? existing.unionId }
            : {}),
          ...(name ? { name } : {})
        }
      });
    }
    return this.prisma.customer.create({
      data: {
        id: newId('C'),
        memberCode: await this.generateMemberCode(),
        name: name || '茶客',
        phone,
        openId: profile.openId ?? null,
        unionId: profile.unionId ?? null,
        createdAt: new Date()
      }
    });
  }

  /**
   * getPhoneNumber 授权（兼容旧会话）：仅用于历史上没有手机号的档案补绑。
   * 已绑定手机号的顾客不允许直接改绑，避免会员身份被换号带走。
   */
  async bindWechatPhone(
    customerId: string,
    payload: { code?: string; encryptedData?: string; iv?: string }
  ) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw unauthorized('顾客会话不存在');
    if (customer.phone) throw badRequest('手机号已是会员唯一身份，不支持直接更换');
    const result = await this.callWechat('phone', () =>
      this.hardware.wechat.phoneNumber({
        openId: customer.openId || customer.id,
        code: payload.code,
        encryptedData: payload.encryptedData,
        iv: payload.iv
      })
    );
    const holder = await this.prisma.customer.findUnique({ where: { phone: result.phone } });
    if (holder && holder.id !== customer.id) throw badRequest('该手机号已绑定其他会员');
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { phone: result.phone }
    });
    return { customer: await this.customerView(updated), provider: this.hardware.wechat.mode };
  }

  /**
   * 微信接口失败必须转成顾客看得懂的业务错误：
   * 授权 code 过期让顾客重试，频率限制提示稍后，凭证/网络异常按服务不可用处理。
   * 微信原始 errcode 只进服务端日志，不回给客户端。
   */
  private async callWechat<T>(action: 'login' | 'phone', task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      throw this.mapWechatError(action, error);
    }
  }

  private mapWechatError(action: 'login' | 'phone', error: unknown): ApiError {
    const raw = error instanceof Error ? error.message : String(error);
    const matched = raw.match(/（(\d{3,6})）/);
    const errcode = matched ? Number(matched[1]) : 0;

    if (WECHAT_EXPIRED_CODES.has(errcode)) {
      return badRequest(
        action === 'login' ? '登录信息已过期，请重新登录' : '手机号授权已过期，请重新授权'
      );
    }
    if (WECHAT_RATE_LIMIT_CODES.has(errcode)) {
      return new ApiError(429, '操作过于频繁，请稍后再试', { code: 'TOO_MANY_REQUESTS' });
    }
    if (process.env.NODE_ENV !== 'test') {
      const safe = raw.replace(/secret=[^&\s]+/gi, 'secret=***').replace(/rid: .*/i, 'rid: <hidden>');
      this.wechatLogger.warn(
        `微信${action === 'login' ? '登录' : '手机号授权'}失败（errcode=${errcode || 'n/a'}）：${safe}`
      );
    }
    return new ApiError(503, '登录服务暂时不可用，请稍后重试', { code: 'WECHAT_UNAVAILABLE' });
  }

  private async generateMemberCode(): Promise<string> {
    for (let i = 0; i < 50; i += 1) {
      const code = `TH-${dayStamp().slice(2)}-${String(randomInt(1000, 10000))}`;
      const exists = await this.prisma.customer.findUnique({ where: { memberCode: code } });
      if (!exists) return code;
    }
    return `TH-${dayStamp().slice(2)}-${newId('M').slice(-4).toUpperCase()}`;
  }

  async customerMe(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw unauthorized('顾客会话不存在');
    return this.customerView(customer);
  }

  /** 支付等场景需要的顾客原始行（含 openId 等未对外字段）；不存在返回 null。 */
  async getCustomerRow(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  /**
   * 按会员码查询权益。门店代点扫的是顾客码，必须回到库内会籍判定，
   * 不能再由适配层（尤其是 mock）凭空授予年卡折扣。
   */
  async memberBenefitByCode(code: string) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return null;
    const row = await this.prisma.customer.findUnique({ where: { memberCode: normalized } });
    if (!row) return null;
    const discountPerCupCents = annualDiscountCents(row);
    return {
      code: row.memberCode,
      tier: discountPerCupCents ? 'annual' : 'standard',
      discountPerCupCents,
      name: row.name,
      memberUntil: row.memberUntil ? row.memberUntil.toISOString() : null
    };
  }

  /**
   * 顾客资料维护：姓名、性别、生日。
   * 字段口径与在场一致（gender 1=男 2=女 null=未填写，birthday 精确到日），
   * 落库后交 ProfileSyncProvider 外推，待第三方用户中心接入时替换实现。
   */
  async updateCustomerProfile(
    customerId: string,
    input: { name?: string; gender?: number | null; birthday?: string | null }
  ) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw unauthorized('顾客会话不存在');

    const data: { name?: string; gender?: number | null; birthday?: Date | null } = {};
    if (input.name !== undefined) data.name = normalizeName(input.name);
    if (input.gender !== undefined) data.gender = normalizeGender(input.gender);
    if (input.birthday !== undefined) data.birthday = normalizeBirthday(input.birthday);
    if (!Object.keys(data).length) throw badRequest('没有需要更新的资料');

    const updated = await this.prisma.customer.update({ where: { id: customer.id }, data });
    await this.syncProfile(updated);
    await logAction(this.prisma, {
      actorId: updated.id,
      actorName: updated.name,
      action: '更新个人资料',
      detail: Object.keys(data).join(','),
      type: 'customer'
    });
    return this.customerView(updated);
  }

  /** 头像上传：base64 交 AvatarStorageProvider 落盘，库里只存 key。 */
  async updateCustomerAvatar(customerId: string, input: { base64: string; contentType: string }) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw unauthorized('顾客会话不存在');
    let stored: { key: string };
    try {
      stored = await this.hardware.avatar.put({
        customerId: customer.id,
        base64: input.base64.replace(/^data:[^;]+;base64,/, ''),
        contentType: input.contentType
      });
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : '头像上传失败');
    }
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { avatarKey: stored.key }
    });
    await this.syncProfile(updated);
    await logAction(this.prisma, {
      actorId: updated.id,
      actorName: updated.name,
      action: '更新头像',
      type: 'customer'
    });
    return this.customerView(updated);
  }

  /**
   * 顾客对外视图：积分以 CRM 为唯一账本。
   * 未开启 CRM 时沿用本地只读字段；开启后调用失败必须报错，绝不静默回退本地 0 分。
   */
  private async customerView(customer: CrmCustomer): Promise<ReturnType<typeof customerPayload>> {
    if (!this.crm.enabled) return customerPayload(customer);
    const member = await this.crm.resolve(this.crmIdentity(customer));
    return customerPayload(customer, member.balance);
  }

  /** 只传业务端本地标识与档案字段；会员号由 CRM 生成，业务端不持有。 */
  private crmIdentity(customer: CrmCustomer): CrmIdentity {
    return {
      localUserId: customer.id,
      phone: customer.phone ?? null,
      name: customer.name,
      unionId: customer.unionId ?? null,
      openId: customer.openId ?? null,
      gender: customer.gender ?? null,
      birthday: customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null
    };
  }

  private async syncProfile(customer: {
    id: string;
    phone: string | null;
    name: string;
    gender: number | null;
    birthday: Date | null;
    avatarKey: string | null;
  }) {
    await this.hardware.profileSync.pushProfile({
      customerId: customer.id,
      phone: customer.phone,
      name: customer.name,
      gender: customer.gender,
      birthday: customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null,
      avatarKey: customer.avatarKey
    });
  }
}

/** 手机号是会员唯一身份：只接受中国大陆 11 位手机号，去空格后统一存库。 */
function normalizePhone(value: string | undefined | null, countryCode?: string): string {
  let phone = String(value || '').replace(/[\s\-()]/g, '');
  if (!phone) throw badRequest('请填写正确的手机号');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  const cc = String(countryCode || '').trim();
  if (cc && cc !== '86' && /^\d+$/.test(phone)) phone = `+${cc}${phone}`;
  if (/^\+861\d{10}$/.test(phone)) phone = phone.slice(3);
  if (/^1\d{10}$/.test(phone) || /^\+\d{7,15}$/.test(phone)) return phone;
  throw badRequest('请填写正确的手机号');
}

function normalizeName(value: string): string {
  const name = String(value).replace(/[\r\n\t]/g, ' ').trim();
  if (!name) throw badRequest('请填写姓名');
  if (name.length > 12) throw badRequest('姓名不能超过 12 个字');
  return name;
}

function normalizeGender(value: number | null): number | null {
  if (value === null) return null;
  if (value !== 1 && value !== 2) throw badRequest('性别取值不正确');
  return value;
}

function normalizeBirthday(value: string | null): Date | null {
  if (value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest('生日格式应为 yyyy-MM-dd');
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw badRequest('生日不是有效日期');
  }
  if (date.getTime() < Date.UTC(1900, 0, 1)) throw badRequest('生日不能早于 1900 年');
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) throw badRequest('生日不能晚于今天');
  return date;
}

/** 年卡会员每杯减免（分）；会员身份与有效期以数据库为准，由服务端统一核验。 */
export const ANNUAL_DISCOUNT_PER_CUP_CENTS = 200;

/** 只有未过期的年卡会员享受每杯立减；普通会员与过期年卡一律 0。 */
export function annualDiscountCents(customer: {
  memberTier?: string | null;
  memberUntil?: Date | null;
}): number {
  const active =
    customer.memberTier === 'annual' &&
    (!customer.memberUntil || customer.memberUntil.getTime() > Date.now());
  return active ? ANNUAL_DISCOUNT_PER_CUP_CENTS : 0;
}

export function customerPayload(
  customer: {
    id: string;
    memberCode: string;
    name: string;
    phone: string | null;
    points?: number;
    avatarKey?: string | null;
    gender?: number | null;
    birthday?: Date | null;
    memberTier?: string | null;
    memberUntil?: Date | null;
  },
  /** 会员中心余额；传入时以它为准，用于替换业务端本地只读积分。 */
  pointsOverride?: number
) {
  // UI-02：会员等级与折扣由服务端按库内记录和有效期判定，不信任客户端申报。
  const discount = annualDiscountCents(customer);
  return {
    ...mapCustomer(customer),
    memberTier: discount ? 'annual' : 'standard',
    discountPerCupCents: discount,
    // 积分全平台共享，CRM 接入后余额来自会员中心；未接入时只展示本地余额。
    points: pointsOverride === undefined ? customer.points ?? 0 : pointsOverride
  };
}
