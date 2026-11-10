import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * 测试用品牌会员 CRM 假服务（X-Fy 契约）。
 * 与旧 x-crm-* 假服务分开：签名串带 nonce，路径含查询串，重复 nonce 返回 409。
 */

export interface FakeBrandRequest {
  method: string
  path: string
  body: string
  keyId: string
  nonce: string
  signatureOk: boolean
}

export interface FakeBrandCrm {
  url: string
  requests: FakeBrandRequest[]
  cardState: 'ACTIVE' | 'NONE'
  points: number
  dice: number
  failNext: { status: number; body: unknown } | null
  delayMs: number
  perks: { prioritySeat: boolean; tierPrice: boolean; invitesPerMonth: number }
  /** passRef → 附赠卡（含撤销状态） */
  bundles: Map<string, { localUserId: string; validFrom: string; validUntil: string; state: string }>
  /** orderRef → 已上报订单 */
  orders: Map<string, { localUserId: string; paidCents: number; savedCents: number; refundCents: number }>
  /** code → 邀请 */
  invites: Map<string, { inviter: string; invitee: string | null; createdAt: string }>
  feedback: Array<{ localUserId: string; content: string; allowQuote: boolean }>
  close: () => Promise<void>
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export const signBrandPayload = (
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  url: string,
  rawBody: string,
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${url}\n${bodyHash}`, 'utf8')
    .digest('hex')
}

const signatureOk = (req: IncomingMessage, rawBody: string, secret: string, path: string) => {
  const timestamp = String(req.headers['x-fy-timestamp'] || '')
  const nonce = String(req.headers['x-fy-nonce'] || '')
  const given = Buffer.from(String(req.headers['x-fy-signature'] || ''), 'utf8')
  const expected = Buffer.from(
    signBrandPayload(secret, timestamp, nonce, req.method || 'GET', path, rawBody),
    'utf8',
  )
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function startFakeBrandCrm(options: {
  keyId: string
  secret: string
  business?: string
}): Promise<FakeBrandCrm> {
  const { keyId, secret } = options
  const business = options.business || 'presence'
  const requests: FakeBrandRequest[] = []
  const nonces = new Set<string>()
  let seq = 0

  const state: FakeBrandCrm = {
    url: '',
    requests,
    cardState: 'ACTIVE',
    points: 500,
    dice: 12,
    failNext: null,
    delayMs: 0,
    perks: { prioritySeat: true, tierPrice: true, invitesPerMonth: 2 },
    bundles: new Map(),
    orders: new Map(),
    invites: new Map(),
    feedback: [],
    close: async () => undefined,
  }

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url || '/'
    const rawBody = await readBody(req)
    const key = String(req.headers['x-fy-key'] || '')
    const nonce = String(req.headers['x-fy-nonce'] || '')
    const ok = key === keyId && signatureOk(req, rawBody, secret, path)
    requests.push({ method: req.method || '', path, body: rawBody, keyId: key, nonce, signatureOk: ok })

    if (state.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, state.delayMs))
    if (state.failNext) {
      const failure = state.failNext
      state.failNext = null
      reply(res, failure.status, failure.body)
      return
    }
    if (!ok) {
      reply(res, 401, { error: 'INVALID_SIGNATURE', message: '签名不正确' })
      return
    }
    if (!nonce || nonces.has(nonce)) {
      reply(res, 409, { error: 'REPLAYED', message: '该签名已被使用，请换新的 nonce' })
      return
    }
    nonces.add(nonce)

    const url = new URL(path, 'http://fake')
    const route = url.pathname
    const card =
      state.cardState === 'ACTIVE'
        ? {
            cardId: 'MBC-TEST-1',
            state: 'ACTIVE',
            productCode: 'FY_ANNUAL',
            productName: 'Full愈年卡',
            priceCents: 29900,
            validFrom: '2026-10-30',
            validUntil: '2027-10-29',
            remainingDays: 356,
            soldBy: 'presence',
            soldByName: '在场',
          }
        : { state: 'NONE' }

    if (req.method === 'GET' && route === '/api/v1/brand-member/me') {
      if (url.searchParams.get('business') !== business) {
        reply(res, 403, { error: 'BUSINESS_MISMATCH', message: '业务不匹配' })
        return
      }
      const localUserId = url.searchParams.get('localUserId') || ''
      if (!localUserId) {
        reply(res, 400, { error: 'BAD_REQUEST', message: '缺少 localUserId' })
        return
      }
      if (localUserId === 'missing') {
        reply(res, 404, { error: 'MEMBER_NOT_FOUND', message: '该用户尚未同步到 CRM' })
        return
      }
      reply(res, 200, {
        member: { memberNo: 'FY-TEST-000002', name: '在场会员', phoneMasked: '139****6620' },
        card,
        points: {
          balance: state.points,
          expiring: 0,
          expireAt: null,
          spend: { teahour: 'display_only', presence: 'display_only', retreat: '1_point_1_yuan' },
        },
        dice: { balance: state.dice, station: 8, monthlyEarned: state.dice },
        prizes: { pending: 1 },
        savedCents: 0,
        benefits: [{ business, title: '在场 · 课程会员价', desc: '没有畅练卡时按品牌会员价' }],
        businessCards: [],
        perks: { presence: state.cardState === 'ACTIVE' ? state.perks : { prioritySeat: false, tierPrice: false, invitesPerMonth: 0 } },
        game: {
          enabled: state.cardState === 'ACTIVE',
          dice: state.dice,
          url:
            state.cardState === 'ACTIVE'
              ? 'https://crm.test/game/?embed=1&host=presence&ticket=tk_fake'
              : null,
        },
        updatedAt: '2026-11-08T10:42:00+08:00',
        stale: false,
      })
      return
    }

    if (req.method === 'GET' && route === '/api/v1/brand-member/products') {
      reply(res, 200, {
        products: [
          {
            code: 'FY_MONTH',
            name: 'Full愈月卡',
            priceCents: 4500,
            validDays: 30,
            benefits: [],
            pointsSpend: {},
            gameEnabled: true,
          },
          {
            code: 'FY_ANNUAL',
            name: 'Full愈年卡',
            priceCents: 29900,
            validDays: 365,
            benefits: [],
            pointsSpend: {},
            gameEnabled: true,
          },
        ],
      })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/quote') {
      const input = JSON.parse(rawBody || '{}') as { productCode?: string; business?: string }
      if (input.business !== business) {
        reply(res, 403, { error: 'BUSINESS_MISMATCH', message: '业务不匹配' })
        return
      }
      if (input.productCode !== 'FY_ANNUAL' && input.productCode !== 'FY_MONTH') {
        reply(res, 404, { error: 'PRODUCT_NOT_FOUND', message: '产品不存在或未生效' })
        return
      }
      seq += 1
      reply(res, 201, {
        quoteId: `BCQ-TEST-${seq}`,
        productCode: input.productCode,
        priceCents: input.productCode === 'FY_ANNUAL' ? 29900 : 4500,
        validDays: input.productCode === 'FY_ANNUAL' ? 365 : 30,
        expiresAt: '2026-11-08T11:12:00+08:00',
      })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/issue') {
      const input = JSON.parse(rawBody || '{}') as {
        quoteId?: string
        orderRef?: string
        paidCents?: number
      }
      if (!input.quoteId || !input.orderRef) {
        reply(res, 400, { error: 'BAD_REQUEST', message: '缺少报价或订单号' })
        return
      }
      if (input.paidCents !== 29900 && input.paidCents !== 4500) {
        reply(res, 409, { error: 'AMOUNT_MISMATCH', message: '实付金额与报价不一致' })
        return
      }
      state.cardState = 'ACTIVE'
      reply(res, 201, {
        memberNo: 'FY-TEST-000002',
        card: {
          cardId: 'MBC-TEST-1',
          state: 'ACTIVE',
          productCode: 'FY_ANNUAL',
          productName: 'Full愈年卡',
          priceCents: input.paidCents,
          validFrom: '2026-11-08',
          validUntil: '2027-11-07',
          remainingDays: 365,
          soldBy: 'presence',
          soldByName: '在场',
        },
        orderRef: input.orderRef,
        paidCents: input.paidCents,
      })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/game/ticket') {
      const input = JSON.parse(rawBody || '{}') as { business?: string }
      if (input.business !== business) {
        reply(res, 403, { error: 'BUSINESS_MISMATCH', message: '业务不匹配' })
        return
      }
      if (state.cardState !== 'ACTIVE') {
        reply(res, 403, { error: 'GAME_UNAVAILABLE', message: '开通有效品牌卡后才能进入愈行之旅' })
        return
      }
      reply(res, 201, {
        ticket: 'tk_fake_0123456789abcdef',
        url: 'https://crm.test/game/?embed=1&host=presence&ticket=tk_fake_0123456789abcdef',
        expiresAt: '2026-11-08T10:47:00+08:00',
      })
      return
    }

    const input = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, any>
    const localUserId = String(input.localUserId || url.searchParams.get('localUserId') || '')
    if (localUserId === 'missing') {
      reply(res, 404, { error: 'MEMBER_NOT_FOUND', message: '该用户尚未同步到 CRM' })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/gift/claim') {
      if (input.code === 'FULLCODE') {
        reply(res, 409, { error: 'GIFT_CODE_FULL', message: '名额已满' })
        return
      }
      if (input.code !== 'GIFT30OK') {
        reply(res, 404, { error: 'GIFT_CODE_INVALID', message: '会员码不存在' })
        return
      }
      state.cardState = 'ACTIVE'
      reply(res, 201, { card: { ...card, state: 'ACTIVE' }, days: 30, replayed: false })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/feedback') {
      state.feedback.push({ localUserId, content: input.content, allowQuote: input.allowQuote })
      reply(res, 201, { id: `FB-${state.feedback.length}` })
      return
    }

    if (req.method === 'GET' && route === '/api/v1/brand-member/stories') {
      if (state.cardState !== 'ACTIVE') {
        reply(res, 403, { error: 'MEMBERS_ONLY', message: '会员故事仅对有效会员开放' })
        return
      }
      reply(res, 200, {
        stories: [{ id: 'ST-1', title: '下班后的一小时', story: '合成故事', quote: null, quoteBy: null }],
      })
      return
    }

    if (req.method === 'GET' && route === '/api/v1/brand-member/invites') {
      const mine = [...state.invites.entries()].filter(([, v]) => v.inviter === localUserId)
      reply(res, 200, {
        monthKey: '2026-11',
        quota: state.perks.invitesPerMonth,
        used: mine.length,
        remaining: Math.max(0, state.perks.invitesPerMonth - mine.length),
        invites: mine.map(([code, v]) => ({
          code,
          status: v.invitee ? 'CLAIMED' : 'ISSUED',
          claimed: Boolean(v.invitee),
          createdAt: v.createdAt,
          claimedAt: null,
        })),
      })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/invites/create') {
      const used = [...state.invites.values()].filter((v) => v.inviter === localUserId).length
      if (state.cardState !== 'ACTIVE') {
        reply(res, 403, { error: 'MEMBERS_ONLY', message: '开通品牌会员后才能邀请好友' })
        return
      }
      if (used >= state.perks.invitesPerMonth) {
        reply(res, 409, { error: 'INVITE_QUOTA_EXCEEDED', message: '本月邀请名额已用完' })
        return
      }
      seq += 1
      const code = `INV${String(seq).padStart(5, '0')}`
      state.invites.set(code, { inviter: localUserId, invitee: null, createdAt: '2026-11-08T10:00:00+08:00' })
      reply(res, 201, {
        code,
        monthKey: '2026-11',
        quota: state.perks.invitesPerMonth,
        used: used + 1,
        remaining: state.perks.invitesPerMonth - used - 1,
        expiresAt: '2026-11-22T10:00:00+08:00',
      })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/invites/claim') {
      const invite = state.invites.get(String(input.code || ''))
      const voucher = { kind: 'PRESENCE_FREE_CLASS', title: '在场 · 免费体验课 1 节', issuer: 'presence' }
      if (!invite) {
        reply(res, 404, { error: 'INVITE_INVALID', message: '邀请不存在或已失效' })
        return
      }
      if (invite.invitee) {
        if (invite.invitee === localUserId) {
          reply(res, 201, { claimed: true, replayed: true, voucher })
          return
        }
        reply(res, 409, { error: 'INVITE_USED', message: '这份邀请已经被领取' })
        return
      }
      if (invite.inviter === localUserId) {
        reply(res, 409, { error: 'INVITE_SELF', message: '不能领取自己发出的邀请' })
        return
      }
      invite.invitee = localUserId
      reply(res, 201, { claimed: true, replayed: false, voucher })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/bundle') {
      const prior = state.bundles.get(input.passRef)
      const replayed = Boolean(
        prior &&
          prior.state !== 'REFUNDED' &&
          prior.validFrom === input.validFrom &&
          prior.validUntil === input.validUntil,
      )
      state.bundles.set(input.passRef, {
        localUserId,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        state: 'ACTIVE',
      })
      reply(res, 201, { card: { state: 'ACTIVE', productCode: 'FY_BUNDLE' }, replayed })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/bundle/revoke') {
      const prior = state.bundles.get(input.passRef)
      if (!prior) {
        reply(res, 404, { error: 'CARD_NOT_FOUND', message: '没有对应的附赠会员' })
        return
      }
      const replayed = prior.state === 'REFUNDED'
      prior.state = 'REFUNDED'
      reply(res, 201, { card: { state: 'REFUNDED' }, replayed })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/orders/report') {
      const prior = state.orders.get(input.orderRef)
      if (prior && prior.paidCents !== input.paidCents) {
        reply(res, 409, { error: 'IDEMPOTENCY_CONFLICT', message: '同一订单金额不一致' })
        return
      }
      state.orders.set(input.orderRef, {
        localUserId,
        paidCents: input.paidCents,
        savedCents: input.savedCents || 0,
        refundCents: prior?.refundCents || 0,
      })
      reply(res, 201, { replayed: Boolean(prior) })
      return
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/orders/refund') {
      const prior = state.orders.get(input.orderRef)
      if (!prior) {
        reply(res, 404, { error: 'ORDER_NOT_FOUND', message: '订单未上报' })
        return
      }
      const replayed = prior.refundCents === input.refundCents
      prior.refundCents = input.refundCents
      reply(res, 201, { replayed, order: { full: input.refundCents >= prior.paidCents } })
      return
    }

    reply(res, 404, { error: 'NOT_FOUND', message: '接口不存在' })
  }

  const server: Server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) reply(res, 500, { error: 'SERVER_ERROR' })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  state.url = `http://127.0.0.1:${address.port}`
  state.close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  return state
}
