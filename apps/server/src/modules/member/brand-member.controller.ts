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
import { BrandPerksService } from '../../common/crm/brand-perks.service'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { MemberService } from './member.service'

/**
 * 品牌会员顾客端接口（在场）。
 *
 * 品牌卡与积分以 CRM 为唯一账本；在场自己的畅练卡是本地权益，
 * 只以只读业务卡的形式合并展示，顾客仍在「在场会员」页办理。
 * 购买/续费需要接入在场支付回调后再调用 CRM issue，本文件不提供绕过支付的入口。
 *
 * 2026-11-08 会议补充：会员码兑换、意见反馈、会员故事、每月邀请好友。
 * 邀请领取后由在场本地发「免费体验课」券（0 元报课），CRM 只记邀请关系与归因。
 */

const PRODUCT_CODE = /^FY_[A-Z0-9_]{2,30}$/
const GIFT_CODE = /^[A-Z0-9]{4,16}$/
const INVITE_CODE = /^[A-Z0-9]{4,16}$/
const DAY_MS = 24 * 60 * 60 * 1000
/** 好友体验课券有效期（天） */
export const INVITE_VOUCHER_DAYS = 30
export const inviteVoucherSource = (code: string) => `在场好友邀请体验课 · ${code}`

const PLAN_NAMES: Record<string, string> = {
  MONTHLY: '月卡',
  QUARTERLY: '季卡',
  YEARLY: '年卡',
}

interface LocalPassCard {
  id: string
  type: string
  status: string
  startDate: Date
  endDate: Date
  absences: number
}

const formatDate = (value: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(value)

/**
 * 把本地畅练卡转成只读业务卡快照。
 * 只展示有效卡：冻结、过期或缺失时不生成条目，避免顾客误以为课程仍免费。
 */
function presencePassSnapshot(card: LocalPassCard | null, now: Date) {
  if (!card || card.status !== 'ACTIVE' || card.endDate.getTime() <= now.getTime()) {
    return null
  }
  const remainingDays = Math.max(
    1,
    Math.ceil((card.endDate.getTime() - now.getTime()) / DAY_MS),
  )
  return {
    business: 'presence',
    code: 'PRESENCE_PASS',
    name: '在场畅练卡',
    planName: PLAN_NAMES[card.type] || '畅练卡',
    state: remainingDays <= 30 ? 'EXPIRING' : 'ACTIVE',
    validUntil: formatDate(card.endDate),
    remainingDays,
    benefits: ['有效期内报课 0 元（不限次）', '免费赠送同期 Full愈 品牌大会员'],
    system: 'presence',
    readOnly: true,
    managePath: '/pages/member/index',
    priorityNote: '畅练卡只含 0 元报课；候补优先排位与会员阶梯价由随赠品牌大会员提供',
  }
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
    private readonly memberService: MemberService,
    private readonly perks: BrandPerksService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: '品牌会员身份、积分与在场畅练卡（合并只读）' })
  async me(@Request() req: any) {
    const userId = req.user.userId
    const [payload, localCard] = await Promise.all([
      this.client.me(userId),
      this.memberService.activeCard(userId) as Promise<LocalPassCard | null>,
    ])
    const snapshot = presencePassSnapshot(localCard, new Date())
    const cards = Array.isArray(payload.businessCards) ? payload.businessCards : []
    const others = cards.filter(
      (item) =>
        !(
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).code === 'PRESENCE_PASS'
        ),
    )
    return {
      ...payload,
      businessCards: snapshot ? [...others, snapshot] : others,
    }
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
  @ApiOperation({ summary: '本月邀请名额与记录' })
  invites(@Request() req: any) {
    return this.client.invites(req.user.userId)
  }

  @Post('invites/create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '生成邀请码（占用本月名额）' })
  createInvite(@Request() req: any) {
    return this.client.createInvite(req.user.userId)
  }

  /**
   * 好友领取邀请。CRM 先确认邀请有效并记归因，再由在场本地发体验课券。
   * 同一好友同一码重放时 CRM 返回 replayed，本地按来源查重，不重复发券；
   * 若上次 CRM 成功但本地发券失败，重放会补发。
   */
  @Post('invites/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '领取好友邀请，获得在场免费体验课 1 节' })
  async claimInvite(@Request() req: any, @Body() body: unknown) {
    const userId = req.user.userId
    const code = readCode(body, INVITE_CODE, '邀请码格式不正确')
    return this.redis.withLock(`brand-invite-claim:${userId}`, async () => {
      const result = await this.client.claimInvite(userId, code)
      const source = inviteVoucherSource(code)
      const existing = await this.prisma.voucher.findFirst({
        where: { userId, source },
        select: { id: true, expiresAt: true, status: true },
      })
      const voucher =
        existing ||
        (await this.prisma.voucher.create({
          data: {
            userId,
            mode: 'REDUCE_TO',
            amount: 0,
            targetPrice: 0,
            applicableCourseIds: [],
            applicableAll: true,
            expiresAt: new Date(Date.now() + INVITE_VOUCHER_DAYS * DAY_MS),
            status: 'UNUSED',
            source,
          },
          select: { id: true, expiresAt: true, status: true },
        }))
      return {
        claimed: true,
        replayed: result.replayed || Boolean(existing),
        voucher: {
          id: voucher.id,
          title: '在场 · 免费体验课 1 节',
          status: voucher.status,
          expiresAt: voucher.expiresAt,
        },
      }
    })
  }
}
