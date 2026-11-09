import { HttpStatus } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { BrandMemberClient } from '../src/common/crm/brand-member.client'
import { BrandPerksService } from '../src/common/crm/brand-perks.service'
import { BusinessException } from '../src/common/exceptions/business.exception'
import {
  BrandMemberController,
  inviteVoucherSource,
} from '../src/modules/member/brand-member.controller'
import {
  BrandPresenceSync,
  passIntent,
  refundedCentsOf,
  savedCentsOf,
} from '../src/modules/member/brand-presence.sync'
import { startFakeBrandCrm, type FakeBrandCrm } from './mocks/brand-crm-fake'

/**
 * 2026-11-08 会议落地（在场侧）：会员码、反馈、故事、邀请好友、畅练卡附赠品牌会员、订单上报。
 * 只用假 CRM 与内存桩，不连数据库、不连真实 CRM。
 */

const env = (url: string) => ({
  BRAND_CRM_ENABLED: '1',
  BRAND_CRM_KEY_ID: 'presence-test',
  BRAND_CRM_SECRET: 'brand-secret-0123456789',
  BRAND_CRM_BASE_URL: url,
})
const configOf = (values: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService

const user = (userId: string) => ({ user: { userId } })

/** 只实现本测试用到的 voucher 读写 */
function voucherStore() {
  const rows: any[] = []
  return {
    rows,
    voucher: {
      findFirst: jest.fn(async ({ where }: any) =>
        rows.find((r) => r.userId === where.userId && r.source === where.source) || null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `v-${rows.length + 1}`, ...data }
        rows.push(row)
        return row
      }),
    },
  }
}

describe('在场品牌会员新增接口', () => {
  let fake: FakeBrandCrm
  let client: BrandMemberClient
  let store: ReturnType<typeof voucherStore>
  let forget: jest.Mock
  let controller: BrandMemberController

  beforeEach(async () => {
    fake = await startFakeBrandCrm({ keyId: 'presence-test', secret: 'brand-secret-0123456789' })
    client = new BrandMemberClient(configOf(env(fake.url)))
    store = voucherStore()
    forget = jest.fn()
    controller = new BrandMemberController(
      client,
      { activeCard: jest.fn().mockResolvedValue(null) } as any,
      { forget } as any,
      store as any,
      { withLock: (_key: string, fn: () => Promise<unknown>) => fn() } as any,
    )
  })

  afterEach(async () => {
    await fake.close()
  })

  it('会员码：格式不对不打 CRM；兑换成功清掉权益缓存；名额已满透出 CRM 文案', async () => {
    const bad = await controller.claimGift(user('u-1'), { code: '短' }).catch((e) => e)
    expect(bad).toMatchObject({ bizCode: 4003 })
    expect(fake.requests).toHaveLength(0)

    const ok = await controller.claimGift(user('u-1'), { code: ' gift30ok ' })
    expect(ok).toMatchObject({ days: 30, replayed: false })
    expect(JSON.parse(fake.requests[0].body)).toEqual({ localUserId: 'u-1', code: 'GIFT30OK' })
    expect(forget).toHaveBeenCalledWith('u-1')

    const full = await controller.claimGift(user('u-1'), { code: 'FULLCODE' }).catch((e) => e)
    expect(full).toBeInstanceOf(BusinessException)
    expect(full).toMatchObject({ bizCode: 4095, message: '名额已满' })
    expect((full as BusinessException).getStatus()).toBe(HttpStatus.CONFLICT)
  })

  it('意见反馈 5–1000 字（与 CRM 一致）；allowQuote 只认布尔 true', async () => {
    const empty = await controller.feedback(user('u-1'), { content: ' ' }).catch((e) => e)
    expect(empty).toMatchObject({ bizCode: 4004 })
    const short = await controller.feedback(user('u-1'), { content: '很好' }).catch((e) => e)
    expect(short).toMatchObject({ bizCode: 4004 })
    const long = await controller
      .feedback(user('u-1'), { content: 'x'.repeat(1001) })
      .catch((e) => e)
    expect(long).toMatchObject({ bizCode: 4004 })
    expect(fake.feedback).toEqual([])

    await controller.feedback(user('u-1'), { content: '  课程节奏很好  ', allowQuote: 'yes' })
    expect(fake.feedback).toEqual([{ localUserId: 'u-1', content: '课程节奏很好', allowQuote: false }])
  })

  it('会员故事仅有效会员可读', async () => {
    const list = await controller.stories(user('u-1'))
    expect(list.stories).toHaveLength(1)
    fake.cardState = 'NONE'
    const denied = await controller.stories(user('u-1')).catch((e) => e)
    expect(denied).toMatchObject({ bizCode: 4037 })
    expect((denied as BusinessException).getStatus()).toBe(HttpStatus.FORBIDDEN)
  })

  it('邀请：名额用完拒绝；好友领取后本地发 0 元体验课券，重放不重复发券', async () => {
    const first = await controller.createInvite(user('inviter'))
    await controller.createInvite(user('inviter'))
    const over = await controller.createInvite(user('inviter')).catch((e) => e)
    expect(over).toMatchObject({ bizCode: 4101 })
    const list = await controller.invites(user('inviter'))
    expect(list).toMatchObject({ quota: 2, used: 2, remaining: 0 })

    const self = await controller
      .claimInvite(user('inviter'), { code: first.code })
      .catch((e) => e)
    expect(self).toMatchObject({ bizCode: 4098 })
    expect(store.rows).toHaveLength(0)

    const claimed = await controller.claimInvite(user('friend'), { code: first.code.toLowerCase() })
    expect(claimed).toMatchObject({ claimed: true, replayed: false })
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({
      userId: 'friend',
      mode: 'REDUCE_TO',
      targetPrice: 0,
      applicableAll: true,
      status: 'UNUSED',
      source: inviteVoucherSource(first.code),
    })
    const days = (store.rows[0].expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThanOrEqual(30)

    const again = await controller.claimInvite(user('friend'), { code: first.code })
    expect(again).toMatchObject({ claimed: true, replayed: true, voucher: { id: 'v-1' } })
    expect(store.rows).toHaveLength(1)

    const taken = await controller
      .claimInvite(user('someone-else'), { code: first.code })
      .catch((e) => e)
    expect(taken).toMatchObject({ bizCode: 4097 })
    expect(store.rows).toHaveLength(1)
  })

  it('CRM 已记领取但上次本地发券失败：重放时补发', async () => {
    const invite = await controller.createInvite(user('inviter'))
    store.voucher.create.mockRejectedValueOnce(new Error('db down'))
    await expect(
      controller.claimInvite(user('friend'), { code: invite.code }),
    ).rejects.toThrow('db down')
    expect(store.rows).toHaveLength(0)

    const retry = await controller.claimInvite(user('friend'), { code: invite.code })
    expect(retry).toMatchObject({ claimed: true, replayed: true })
    expect(store.rows).toHaveLength(1)
  })
})

describe('BrandPerksService：品牌会员权益缓存', () => {
  const payload = (state: string, presence: unknown) =>
    ({ card: { state }, perks: { presence } }) as any

  it('有效会员读 perks；非会员与档案未同步按非会员缓存', async () => {
    const me = jest
      .fn()
      .mockResolvedValueOnce(payload('ACTIVE', { tierPrice: true, prioritySeat: true, invitesPerMonth: 3 }))
      .mockResolvedValueOnce(payload('EXPIRED', { tierPrice: true }))
      .mockRejectedValueOnce(new BusinessException('同步中', 4041, HttpStatus.NOT_FOUND))
    const svc = new BrandPerksService({ enabled: true, me } as any)

    expect(await svc.resolve('a', 0)).toEqual({
      perks: { tierPrice: true, prioritySeat: true, invitesPerMonth: 3 },
      unknown: false,
    })
    expect(await svc.resolve('a', 30_000)).toMatchObject({ unknown: false })
    expect(me).toHaveBeenCalledTimes(1)

    expect(await svc.resolve('b', 0)).toEqual({ perks: null, unknown: false })
    expect(await svc.resolve('c', 0)).toEqual({ perks: null, unknown: false })
  })

  it('CRM 故障：24 小时内沿用上次结果，否则 unknown；forget 后重新查', async () => {
    const perks = { tierPrice: true, prioritySeat: false, invitesPerMonth: 0 }
    const me = jest
      .fn()
      .mockResolvedValueOnce(payload('ACTIVE', perks))
      .mockRejectedValue(new BusinessException('不可用', 5030, HttpStatus.SERVICE_UNAVAILABLE))
    const svc = new BrandPerksService({ enabled: true, me } as any)

    await svc.resolve('a', 0)
    expect(await svc.resolve('a', 2 * 60_000)).toEqual({ perks, unknown: false })
    expect(await svc.resolve('a', 25 * 60 * 60_000)).toEqual({ perks: null, unknown: true })
    expect(await svc.resolve('fresh', 0)).toEqual({ perks: null, unknown: true })

    svc.forget('a')
    await svc.resolve('a', 1000)
    expect(me).toHaveBeenCalledTimes(5)
  })

  it('CRM 未开启：一律非会员，不发请求', async () => {
    const me = jest.fn()
    const svc = new BrandPerksService({ enabled: false, me } as any)
    expect(await svc.resolve('a')).toEqual({ perks: null, unknown: false })
    expect(me).not.toHaveBeenCalled()
  })
})

describe('BrandPresenceSync：畅练卡附赠与订单上报', () => {
  const NOW = new Date('2026-11-08T12:00:00+08:00')
  let fake: FakeBrandCrm
  let client: BrandMemberClient
  let cards: any[]
  let orders: any[]
  let forget: jest.Mock
  let sync: BrandPresenceSync

  const card = (over: Record<string, unknown> = {}) => ({
    id: 'pass-1',
    userId: 'u-1',
    status: 'ACTIVE',
    startDate: new Date('2026-11-01T10:00:00+08:00'),
    endDate: new Date('2026-12-01T10:00:00+08:00'),
    ...over,
  })

  const order = (over: Record<string, unknown> = {}) => ({
    id: 'o-1',
    userId: 'u-1',
    orderType: 'COURSE',
    status: 'PAID',
    cardType: null,
    actualPaid: 30000, // 课程链路以分存储
    discountAmount: 6000,
    paymentTime: new Date('2026-11-07T09:00:00+08:00'),
    refunds: [],
    ...over,
  })

  beforeEach(async () => {
    fake = await startFakeBrandCrm({ keyId: 'presence-test', secret: 'brand-secret-0123456789' })
    client = new BrandMemberClient(configOf(env(fake.url)))
    cards = []
    orders = []
    forget = jest.fn()
    const prisma = {
      memberCard: { findMany: jest.fn(async () => cards) },
      order: { findMany: jest.fn(async () => orders) },
    }
    sync = new BrandPresenceSync(prisma as any, client, { forget } as any)
  })

  afterEach(async () => {
    await fake.close()
  })

  it('passIntent：按上海日期附赠，结束日取最后一个有效日；退款到起始日即撤销', () => {
    expect(passIntent(card(), NOW)).toEqual({
      kind: 'bundle',
      validFrom: '2026-11-01',
      validUntil: '2026-12-01',
    })
    expect(
      passIntent(card({ endDate: new Date('2026-12-01T00:00:00+08:00') }), NOW),
    ).toMatchObject({ validUntil: '2026-11-30' })
    expect(passIntent(card({ endDate: new Date('2026-11-01T10:00:00+08:00') }), NOW)).toEqual({
      kind: 'revoke',
    })
    expect(passIntent(card({ status: 'EXPIRED' }), NOW)).toEqual({ kind: 'revoke' })
    expect(passIntent(card({ status: 'FROZEN' }), NOW)).toMatchObject({ kind: 'bundle' })
  })

  it('订单金额：整单退款按实付；部分退款按已到账流水；畅练卡订单不计会员节省', () => {
    expect(refundedCentsOf(order({ status: 'REFUNDED' }) as any, 30000)).toBe(30000)
    expect(
      refundedCentsOf(order({ refunds: [{ amountFen: 5000 }, { amountFen: 4000 }] }) as any, 30000),
    ).toBe(9000)
    expect(refundedCentsOf(order({ refunds: [{ amountFen: 99999 }] }) as any, 30000)).toBe(30000)
    expect(savedCentsOf(order() as any)).toBe(6000)
    expect(savedCentsOf(order({ cardType: 'YEARLY' }) as any)).toBe(0)
    // 畅练卡商品订单以元存储，且不是会员价订单
    expect(savedCentsOf(order({ orderType: 'MEMBER_CARD', discountAmount: 10 }) as any)).toBe(0)
  })

  it('附赠 → 改期 → 撤销，均幂等；无变化时不重复请求', async () => {
    cards = [card()]
    const first = await sync.runOnce(NOW, { passes: true })
    expect(first).toMatchObject({ bundled: 1, failed: 0 })
    expect(fake.bundles.get('pass-1')).toMatchObject({
      localUserId: 'u-1',
      validFrom: '2026-11-01',
      validUntil: '2026-12-01',
      state: 'ACTIVE',
    })
    expect(forget).toHaveBeenCalledWith('u-1')

    const before = fake.requests.length
    expect(await sync.runOnce(NOW, { passes: true })).toMatchObject({ bundled: 0, skipped: 1 })
    expect(fake.requests.length).toBe(before)

    cards = [card({ endDate: new Date('2027-01-01T10:00:00+08:00') })]
    expect(await sync.runOnce(NOW, { passes: true })).toMatchObject({ bundled: 1 })
    expect(fake.bundles.get('pass-1')?.validUntil).toBe('2027-01-01')

    cards = [card({ endDate: card().startDate, status: 'EXPIRED' })]
    expect(await sync.runOnce(NOW, { passes: true })).toMatchObject({ revoked: 1 })
    expect(fake.bundles.get('pass-1')?.state).toBe('REFUNDED')
  })

  it('从未附赠的卡撤销视为完成；档案未同步退避，不阻塞其他卡', async () => {
    cards = [
      card({ id: 'never', endDate: card().startDate }),
      card({ id: 'missing-pass', userId: 'missing' }),
      card({ id: 'pass-2', userId: 'u-2' }),
    ]
    const result = await sync.runOnce(NOW, { passes: true })
    expect(result).toMatchObject({ bundled: 1, revoked: 0, missing: 1, failed: 0 })
    expect(fake.bundles.has('pass-2')).toBe(true)

    const count = fake.requests.length
    await sync.runOnce(new Date(NOW.getTime() + 60_000), { passes: true })
    // never 已完成、missing 在退避中、pass-2 无变化：都不再请求
    expect(fake.requests.length).toBe(count)
  })

  it('未建档只记 missing，契约错误才记 failed', async () => {
    orders = [order({ userId: 'missing' })]
    expect(await sync.runOnce(NOW, { orders: true })).toMatchObject({
      reported: 0,
      missing: 1,
      failed: 0,
    })

    orders = [order()]
    fake.failNext = { status: 400, body: { error: 'BAD_REQUEST' } }
    expect(await sync.runOnce(NOW, { orders: true })).toMatchObject({
      reported: 0,
      missing: 0,
      failed: 1,
    })
  })

  it('订单上报：实付与会员节省按分上报，部分退款累计上报；CRM 故障整批停下且不记指纹', async () => {
    orders = [order(), order({ id: 'o-2', userId: 'u-2', refunds: [{ amountFen: 10000 }] })]
    const first = await sync.runOnce(NOW, { orders: true })
    expect(first).toMatchObject({ reported: 2, refunded: 1, failed: 0 })
    expect(fake.orders.get('o-1')).toMatchObject({ paidCents: 30000, savedCents: 6000, refundCents: 0 })
    expect(fake.orders.get('o-2')).toMatchObject({ refundCents: 10000 })

    orders = [order({ status: 'REFUNDED' }), order({ id: 'o-2', userId: 'u-2', refunds: [{ amountFen: 10000 }] })]
    fake.failNext = { status: 503, body: { error: 'UNAVAILABLE' } }
    const down = await sync.runOnce(NOW, { orders: true })
    expect(down).toMatchObject({ failed: 1, reported: 0 })

    const recovered = await sync.runOnce(NOW, { orders: true })
    expect(recovered).toMatchObject({ reported: 1, refunded: 1, skipped: 1 })
    expect(fake.orders.get('o-1')?.refundCents).toBe(30000)
  })

  it('畅练卡同步遇到 CRM 不可用时，本轮不再上报订单', async () => {
    cards = [card()]
    orders = [order()]
    fake.failNext = { status: 500, body: { error: 'INTERNAL' } }
    const result = await sync.runOnce(NOW, { passes: true, orders: true })
    expect(result).toMatchObject({ failed: 1, reported: 0 })
    expect(fake.orders.size).toBe(0)
  })

  it('开关默认开启；显式设为 0 时才停用', async () => {
    cards = [card()]
    orders = [order()]
    process.env.BRAND_PASS_BUNDLE_ENABLED = '0'
    process.env.BRAND_ORDER_REPORT_ENABLED = '0'
    const result = await sync.runOnce(NOW)
    expect(result).toMatchObject({ bundled: 0, reported: 0 })
    expect(fake.requests).toHaveLength(0)
    delete process.env.BRAND_PASS_BUNDLE_ENABLED
    delete process.env.BRAND_ORDER_REPORT_ENABLED
  })
})

describe('候补优先排位：品牌会员 prioritySeat', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WaitlistService } = require('../src/modules/waitlist/waitlist.service')
  const svc = new WaitlistService({}, {}, {}, {}, {})
  const clientOf = (card: unknown, memberCount: number) => ({
    memberCard: { findFirst: async () => card },
    waitlistEntry: { count: async () => memberCount },
  })
  const brand = (prioritySeat: boolean) => ({
    perks: { prioritySeat, tierPrice: true, invitesPerMonth: 2 },
    unknown: false,
  })
  const seat = (client: unknown, b?: unknown) =>
    (svc as any).decideSeatType('c1', 'u1', 2, client, b)

  it('无畅练卡但品牌会员有优先排位，会员席未满时进会员席', async () => {
    await expect(seat(clientOf(null, 0), brand(true))).resolves.toBe('MEMBER')
  })
  it('会员席已满时进普通席', async () => {
    await expect(seat(clientOf(null, 2), brand(true))).resolves.toBe('NORMAL')
  })
  it('非会员或品牌状态未知时按普通席', async () => {
    await expect(seat(clientOf(null, 0), brand(false))).resolves.toBe('NORMAL')
    await expect(seat(clientOf(null, 0), { perks: null, unknown: true })).resolves.toBe('NORMAL')
    await expect(seat(clientOf(null, 0))).resolves.toBe('NORMAL')
  })
  it('只持畅练卡、没有品牌会员权益时不直接占会员席（优先排位已迁到品牌会员）', async () => {
    await expect(seat(clientOf({ id: 'card' }, 1), undefined)).resolves.toBe('NORMAL')
  })
})
