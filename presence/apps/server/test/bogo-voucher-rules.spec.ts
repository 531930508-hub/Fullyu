import { EnrollmentService } from '../src/modules/order/enrollment.service'
import { PaymentService } from '../src/modules/payment/payment.service'

/**
 * 买一赠一券（PRESENCE_BOGO_CLASS）：同席报名校验与邀请人退课级联。
 * 纯内存桩，不连数据库：只验证规则分支，不校验 SQL。
 */
const COURSE = 'course-bogo'

function serviceWithVoucher(voucher: any, sponsor: any) {
  const svc: any = new EnrollmentService({} as any, {} as any, {} as any)
  const tx = {
    voucher: {
      findFirst: async ({ where }: any) => (voucher && voucher.id === where.id ? voucher : null),
    },
    order: {
      findFirst: async ({ where }: any) =>
        sponsor && sponsor.userId === where.userId && sponsor.courseId === where.courseId
          ? sponsor
          : null,
    },
  }
  return { svc, tx }
}

const bogo = () => ({
  id: 'v-bogo',
  userId: 'friend',
  status: 'UNUSED',
  expiresAt: new Date(Date.now() + 86_400_000),
  applicableAll: true,
  applicableCourseIds: [],
  hostUserId: 'host',
})

const bizCode = (error: any) => error?.bizCode ?? error?.getResponse?.()?.code

describe('买一赠一券：报名校验', () => {
  const validate = async (voucher: any, sponsor: any) => {
    const { svc, tx } = serviceWithVoucher(voucher, sponsor)
    return svc.validateVoucher(tx, 'v-bogo', voucher?.userId ?? 'friend', COURSE)
  }

  it('邀请人已付同课 → 好友订单绑定邀请人订单', async () => {
    const result = await validate(bogo(), { id: 'o-host', userId: 'host', courseId: COURSE })
    expect(result.sponsorOrderId).toBe('o-host')
  })

  it('邀请人还没报名这节 → 拒绝同席', async () => {
    await expect(validate(bogo(), null)).rejects.toMatchObject({
      message: '买一赠一券需与邀请人报名同一节课',
    })
  })

  it('邀请人不能用自己的券', async () => {
    const voucher = { ...bogo(), userId: 'host', hostUserId: 'host' }
    await expect(validate(voucher, null)).rejects.toMatchObject({
      message: '这是你发出的买一赠一券，请好友使用',
    })
  })

  it('券已使用 / 已过期 / 不适用该课程分别给出业务码', async () => {
    const cases: Array<[any, number]> = [
      [{ ...bogo(), status: 'USED' }, 4015],
      [{ ...bogo(), expiresAt: new Date(Date.now() - 1000) }, 4016],
      [{ ...bogo(), applicableAll: false, applicableCourseIds: ['other'] }, 4017],
    ]
    for (const [voucher, code] of cases) {
      await expect(validate(voucher, null)).rejects.toMatchObject({ bizCode: code })
    }
  })

  it('普通券不受同席限制', async () => {
    const result = await validate({ ...bogo(), hostUserId: null }, null)
    expect(result.sponsorOrderId).toBeUndefined()
  })

  it('邀请人未报名时，券列表里不展示这张券；报名后恢复展示', async () => {
    const prisma: any = {
      voucher: {
        findMany: async () => [bogo(), { ...bogo(), id: 'v-plain', hostUserId: null }],
      },
      order: { findMany: async () => [] },
    }
    const svc: any = new EnrollmentService(prisma, {} as any, {} as any)
    const hidden = await svc.listUsableVouchers('friend', COURSE)
    expect(hidden.map((v: any) => v.id)).toEqual(['v-plain'])

    prisma.order.findMany = async () => [{ userId: 'host' }]
    const shown = await svc.listUsableVouchers('friend', COURSE)
    expect(shown.map((v: any) => v.id).sort()).toEqual(['v-bogo', 'v-plain'])
  })
})

describe('买一赠一券：邀请人退课级联', () => {
  function paymentService(companion: any, opts: { closed?: boolean } = {}) {
    const calls: string[] = []
    const prisma: any = {
      order: {
        findMany: async () => (companion ? [companion] : []),
        updateMany: async ({ data }: any) => {
          calls.push(`order:${data.status}`)
          return { count: opts.closed === false ? 0 : 1 }
        },
      },
      voucher: {
        findUnique: async () => ({ id: 'v1', expiresAt: new Date(Date.now() - 1000) }),
        update: async ({ data }: any) => {
          calls.push(`voucher:${data.status}`)
          return {}
        },
      },
      pointsRecord: { findFirst: async () => ({ balance: 0 }), create: async () => ({}) },
      course: {
        updateMany: async () => {
          calls.push('seat:decrement')
          return { count: 1 }
        },
      },
    }
    const redis: any = {
      unlockSeat: async () => {
        calls.push('seat:unlock')
      },
    }
    const notification: any = {
      inviteCompanionCancelled: async () => {
        calls.push('notify:friend')
      },
    }
    const waitlist: any = {
      promote: async () => {
        calls.push('waitlist:promote')
      },
    }
    const svc: any = new PaymentService(
      prisma,
      redis,
      {} as any,
      notification,
      waitlist,
      {} as any,
      {} as any,
    )
    return { svc, calls }
  }

  const paidCompanion = {
    id: 'o-friend',
    userId: 'friend',
    status: 'PAID',
    courseId: COURSE,
    orderType: 'COURSE',
    pointsDeduction: 0,
    voucherId: 'v1',
    course: { title: '晨间流瑜伽', startDate: new Date('2026-12-01'), startTime: '10:00' },
  }

  it('已付同席单退款、释放座位、回补券并通知好友', async () => {
    const { svc, calls } = paymentService(paidCompanion)
    await svc.cancelInviteCompanions('o-host', { releaseSeat: true })
    expect(calls).toEqual(
      expect.arrayContaining([
        'order:REFUNDED',
        'voucher:EXPIRED',
        'seat:unlock',
        'seat:decrement',
        'waitlist:promote',
        'notify:friend',
      ]),
    )
  })

  it('待支付同席单直接取消，不重复释放座位', async () => {
    const { svc, calls } = paymentService({ ...paidCompanion, status: 'PENDING_PAYMENT' })
    await svc.cancelInviteCompanions('o-host', { releaseSeat: true })
    expect(calls).toContain('order:CANCELLED')
    expect(calls).not.toContain('seat:decrement')
    expect(calls).toContain('notify:friend')
  })

  it('课程整体取消时不释放座位，但仍通知好友', async () => {
    const { svc, calls } = paymentService(paidCompanion)
    await svc.cancelInviteCompanions('o-host', { releaseSeat: false })
    expect(calls).not.toContain('seat:decrement')
    expect(calls).not.toContain('waitlist:promote')
    expect(calls).toContain('notify:friend')
  })

  it('并发已处理（条件更新未命中）时不重复回补与通知', async () => {
    const { svc, calls } = paymentService(paidCompanion, { closed: false })
    await svc.cancelInviteCompanions('o-host', { releaseSeat: true })
    expect(calls).toEqual(['order:REFUNDED'])
  })
})