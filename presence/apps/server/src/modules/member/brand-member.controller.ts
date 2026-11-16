import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { BusinessException } from '../../common/exceptions/business.exception'
import { BrandMemberClient } from '../../common/crm/brand-member.client'
import { BrandMemberLinkService } from '../../common/crm/brand-member-link.service'
import { BrandPerksService } from '../../common/crm/brand-perks.service'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'

/**
 * 品牌会员顾客端接口（在场）。
 *
 * 品牌卡与积分以 CRM 为唯一账本（畅练卡已下线，不再合并本地卡）。
 * 购买/续费需要接入在场支付回调后再调用 CRM issue，本文件不提供绕过支付的入口。
 *
 * 2026-11-08 会议补充：会员码兑换、意见反馈、会员故事、邀请好友。
 * 2026-11-09 邀请改版：名额按自然季发放 1 张，好友领「买一赠一券」，
 * 只能与邀请人报名同一节课并免费同行（券 3 个月有效，过期失效）。
 * CRM 只记邀请关系与归因，券与同席约束都由在场落库执行。
 */

const PRODUCT_CODE = /^FY_[A-Z0-9_]{2,30}$/
const GIFT_CODE = /^[A-Z0-9]{4,16}$/
const INVITE_CODE = /^[A-Z0-9]{4,16}$/
const DAY_MS = 24 * 60 * 60 * 1000
/** 买一赠一券有效期（月）：与 CRM 下一季发券首尾相接 */
export const INVITE_VOUCHER_MONTHS = 3
/** 旧 CRM（未返回邀请人）时退化为 30 天免费体验课券 */
export const INVITE_VOUCHER_DAYS = 30
export const inviteVoucherSource = (code: string) => `在场好友邀请买一赠一券 · ${code}`
export const legacyInviteVoucherSource = (code: string) => `在场好友邀请体验课 · ${code}`

/** 加自然月并夹住月末（1/31 + 3 个月 → 4/30，而不是溢出到 5/1）。 */
function addMonths(from: Date, months: number): Date {
  const at = new Date(from.getTime())
  const day = at.getDate()
  at.setDate(1)
  at.setMonth(at.getMonth() + months)
  const lastDay = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate()
  at.setDate(Math.min(day, lastDay))
  return at
}

const recordOf = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

function readProductCode(body: unknown): string {
  const record = recordOf(body)
  const code = typeof record.productCode === 'string' ? record.productCode.trim() : ''
  if (!PRODUCT_CODE.test(code)) {
    throw new BusinessException('会员卡编码不正确', 4001, HttpStatus.BAD_REQUEST)
  }
  return code
}

/** 会员码 / 邀请码：去空格、转大写后校验，格式不对直接拒绝，不打 CRM。 */
function readCode(body: unknown, pattern: RegExp, message: string): string {
  const raw = recordOf(body).code
  const code = typeof raw === 'string' ? raw.replace(/\s+/g, '').toUpperCase() : ''
  if (!pattern.test(code)) {
    throw new BusinessException(message, 4003, HttpStatus.BAD_REQUEST)
  }
  return code
}

export function readFeedback(body: unknown): { content: string; allowQuote: boolean } {
  const record = recordOf(body)
  const content = typeof record.content === 'string' ? record.content.trim() : ''
  // 与 CRM `submitFeedback` 一致：5–1000 字
  if (content.length < 5 || content.length > 1000) {
    throw new BusinessException('请写 5–1000 字的意见', 4004, HttpStatus.BAD_REQUEST)
  }
  return { content, allowQuote: record.allowQuote === true }
}

@ApiTags('品牌会员')
@Controller('member/brand')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class BrandMemberController {
  constructor(
    private readonly client: BrandMemberClient,
    private readonly perks: BrandPerksService,
    private readonly links: BrandMemberLinkService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: '品牌会员身份与积分' })
  async me(@Request() req: any) {
    const userId = req.user.userId
    const payload = await this.client.me(userId)
    // 顺手记住 memberNo：CRM 推送只带会员号，靠这条映射才能精确清缓存。
    void this.links.remember(userId, payload?.member?.memberNo)
    return payload
  }

  @Get('products')
  @ApiOperation({ summary: '品牌会员卡商品目录（CRM 定价）' })
  products() {
    return this.client.products()
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '按 CRM 报价单确认金额' })
  quote(@Request() req: any, @Body() body: unknown) {
    return this.client.quote(req.user.userId, readProductCode(body))
  }

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '开通品牌会员卡（支付通道未接入时如实拒绝）' })
  async purchase(@Body() body: unknown) {
    // 先校验入参，避免把明显的错误请求当成“通道未接入”。
    readProductCode(body)
    throw new BusinessException(
      '会员卡支付通道尚未接入，暂不能在在场开通',
      5034,
      HttpStatus.NOT_IMPLEMENTED,
    )
  }

  @Post('game/ticket')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '换取愈行之旅一次性入口票据' })
  gameTicket(@Request() req: any) {
    return this.client.gameTicket(req.user.userId)
  }

  @Post('gift/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '兑换会员码（CRM 校验名额、截止与审批）' })
  async claimGift(@Request() req: any, @Body() body: unknown) {
    const userId = req.user.userId
    const code = readCode(body, GIFT_CODE, '会员码格式不正确')
    const result = await this.client.claimGift(userId, code)
    this.perks.forget(userId)
    return result
  }

  @Post('feedback')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '提交意见反馈' })
  async feedback(@Request() req: any, @Body() body: unknown) {
    const { content, allowQuote } = readFeedback(body)
    return this.client.submitFeedback(req.user.userId, content, allowQuote)
  }

  @Get('stories')
  @ApiOperation({ summary: '会员故事（仅有效会员可读）' })
  stories(@Request() req: any) {
    return this.client.stories(req.user.userId)
  }

  @Get('invites')
  @ApiOperation({ summary: '本季邀请名额与记录' })
  invites(@Request() req: any) {
    return this.client.invites(req.user.userId)
  }

  @Post('invites/create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '生成邀请码（占用本季名额）' })
  createInvite(@Request() req: any) {
    return this.client.createInvite(req.user.userId)
  }

  /**
   * 好友领取邀请：CRM 确认邀请有效并回传邀请人，在场发「买一赠一券」并绑定 host。
   * 同一好友同一码重放时 CRM 返回 replayed，本地按来源查重，不重复发券；
   * 若上次 CRM 成功但本地发券失败，重放会补发。同一好友可领不同人的邀请，每次各得 1 张券。
   */
  @Post('invites/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '领取好友邀请，获得在场买一赠一券' })
  async claimInvite(@Request() req: any, @Body() body: unknown) {
    const userId = req.user.userId
    const code = readCode(body, INVITE_CODE, '邀请码格式不正确')
    return this.redis.withLock(`brand-invite-claim:${userId}`, async () => {
      const result = await this.client.claimInvite(userId, code)
      const hostUserId = result.inviter?.localUserId || null
      const source = hostUserId ? inviteVoucherSource(code) : legacyInviteVoucherSource(code)
      // 升级窗口内可能已发过旧来源的券：两种来源一起查，避免同一码重复发券
      const existing = await this.prisma.voucher.findFirst({
        where: {
          userId,
          source: { in: [inviteVoucherSource(code), legacyInviteVoucherSource(code)] },
        },
        select: { id: true, expiresAt: true, status: true, hostUserId: true },
        orderBy: { createdAt: 'desc' },
      })
      const voucher =
        existing ||
        (await this.prisma.voucher.create({
          data: {
            userId,
            hostUserId,
            // 买一赠一：好友席免单，hostUserId 绑定邀请人（老流程的「减至 0」保留兼容读）
            mode: hostUserId ? 'BOGO' : 'REDUCE_TO',
            amount: 0,
            targetPrice: hostUserId ? null : 0,
            applicableCourseIds: [],
            applicableAll: true,
            expiresAt: hostUserId
              ? addMonths(new Date(), INVITE_VOUCHER_MONTHS)
              : new Date(Date.now() + INVITE_VOUCHER_DAYS * DAY_MS),
            status: 'UNUSED',
            source,
          },
          select: { id: true, expiresAt: true, status: true, hostUserId: true },
        }))
      const isBogo = Boolean(voucher.hostUserId)
      return {
        claimed: true,
        replayed: result.replayed || Boolean(existing),
        voucher: {
          id: voucher.id,
          kind: isBogo ? 'PRESENCE_BOGO_CLASS' : 'PRESENCE_FREE_CLASS',
          title: isBogo ? '在场 · 买一赠一券' : '在场 · 免费体验课 1 节',
          status: voucher.status,
          expiresAt: voucher.expiresAt,
          daysLeft: Math.max(
            0,
            Math.ceil((voucher.expiresAt.getTime() - Date.now()) / DAY_MS),
          ),
          usage: isBogo
            ? '与邀请人报名同一节课，好友免费同行；邀请人退课则本席一并取消'
            : '任意可预约课程免费体验 1 次',
          host: isBogo ? { nickname: result.inviter?.nickname || '你的好友' } : null,
        },
      }
    })
  }
}
