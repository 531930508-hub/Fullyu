import { Injectable } from '@nestjs/common'
import { currentMonth, isBelowSafety, orderAmountToFen, resolveWorkbenchBlocks } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { TodoService } from '../todo/todo.service'

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly todoService: TodoService,
  ) {}

  /** 仪表盘概览统计 */
  async overview() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      userCount,
      courseCount,
      paidOrders,
      monthPaidOrders,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.course.count(),
      this.prisma.order.findMany({
        where: { status: { in: ['PAID', 'COMPLETED'] } },
        select: { actualPaid: true, orderType: true },
      }),
      this.prisma.order.findMany({
        where: {
          status: { in: ['PAID', 'COMPLETED'] },
          paymentTime: { gte: monthStart },
        },
        select: { actualPaid: true, orderType: true },
      }),
    ])

    const totalRevenue = paidOrders.reduce((s, o) => s + orderAmountToFen(o.orderType, Number(o.actualPaid)), 0)
    const monthRevenue = monthPaidOrders.reduce((s, o) => s + orderAmountToFen(o.orderType, Number(o.actualPaid)), 0)

    return {
      userCount,
      courseCount,
      orderCount: paidOrders.length,
      totalRevenue,
      monthRevenue,
      monthOrderCount: monthPaidOrders.length,
    }
  }

  /**
   * 首页工作台。
   *
   * 与 /analytics 下的其他接口不同，这里刻意不设权限门 —— 首页是所有登录人的落地页，
   * 不能因为少一个模块权限就整页弹红字。改成每一块各自判权限：没权限的块不查库、
   * 不返回数据，并在 blocks 里标成 false，由前端整块不渲染。
   */
  async workbench(admin: AdminContext, dateStr?: string) {
    const blocks = resolveWorkbenchBlocks(admin.permissions)

    const now = new Date()
    // 支持指定日期查看场地占用，默认今日
    let dayStart: Date
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dayStart = new Date(dateStr + 'T00:00:00')
    } else {
      dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayStart.getDate() + 1)

    // 库存预警按数据范围过滤：门店只该看到自己仓的缺货，看不到别家门店
    const scope = await buildOrgScope(this.prisma, admin)

    const [
      todayCoursesRaw,
      venues,
      reservations,
      recentOrdersRaw,
      stockRows,
      todayCheckinCount,
      todoPreview,
      monthRevenueAgg,
    ] = await Promise.all([
      // 今日课程条数是所有人可见的统计卡，这条无论有没有 course:view 都要查
      this.prisma.course.findMany({
        where: { startDate: { gte: dayStart, lt: dayEnd }, status: { in: ['PUBLISHED', 'COMPLETED'] } },
        include: {
          trainer: { select: { displayName: true } },
          venue: { select: { id: true, name: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      blocks.venues ? this.prisma.venue.findMany({ orderBy: { createdAt: 'asc' } }) : [],
      blocks.venues
        ? this.prisma.venueReservation.findMany({
            where: { date: { gte: dayStart, lt: dayEnd }, courseId: null },
          })
        : [],
      blocks.orders
        ? this.prisma.order.findMany({
            where: { status: { in: ['PAID', 'COMPLETED'] } },
            orderBy: { paymentTime: 'desc' },
            take: 6,
            include: {
              user: { select: { nickname: true } },
              course: { select: { title: true } },
            },
          })
        : [],
      blocks.stock
        ? this.prisma.stockBalance.findMany({
            where: scope.toWhere('ownerOrgId'),
            include: { product: { select: { name: true, unit: true, safetyStock: true } } },
            orderBy: { qty: 'asc' },
          })
        : [],
      this.prisma.checkIn.count({ where: { checkedAt: { gte: dayStart, lt: dayEnd } } }),
      // 待办统一走待办中心：审批、退款跟进、入群审核、库存预警同一份口径
      this.todoService.preview(admin, 4),
      blocks.revenue
        ? this.prisma.revenueRecord.aggregate({
            _sum: { amount: true },
            where: { month: currentMonth(now), ...scope.toWhere('orgId') },
          })
        : null,
    ])

    const toMin = (t: string) => {
      const [h, m] = (t || '0:0').split(':').map(Number)
      return (h || 0) * 60 + (m || 0)
    }
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    /**
     * “进行中/已结束”只在看当天时才能拿当前时刻现算。
     * 否则翻到上个月某天，一节 19:00 的课会因为“现在是 20 点”被标成进行中。
     */
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOffset = dayStart.getTime() - todayStart.getTime()
    const viewingPast = dayOffset < 0
    const viewingFuture = dayOffset > 0

    // 当日课程（含状态）
    const todayCourses = todayCoursesRaw.map((c) => {
      const s = toMin(c.startTime)
      const e = toMin(c.endTime)
      let statusText = '待开始'
      let statusColor = 'blue'
      let statusClass = 'upcoming'
      if (c.currentEnrolled >= c.maxCapacity) {
        statusText = '已满员'
        statusColor = 'gold'
      }
      if (viewingPast) {
        statusText = '已结束'
        statusColor = 'default'
        statusClass = 'done'
      } else if (!viewingFuture) {
        if (nowMinutes >= e) {
          statusText = '已结束'
          statusColor = 'default'
          statusClass = 'done'
        } else if (nowMinutes >= s) {
          statusText = '进行中'
          statusColor = 'green'
          statusClass = 'active'
        }
      }
      return {
        id: c.id,
        time: `${c.startTime}-${c.endTime}`,
        name: c.title,
        trainer: c.trainer?.displayName || '—',
        venue: c.venue?.name || '—',
        enrolled: c.currentEnrolled,
        capacity: c.maxCapacity,
        statusClass,
        statusColor,
        statusText,
      }
    })

    // 场地占用（今日课程 + 场地预约）
    const SLOT_BASE = 8 * 60
    const SLOT_TOTAL = 28
    const toSlot = (t: string) => Math.round((toMin(t) - SLOT_BASE) / 30)
    const venueList = venues.map((v) => {
      const ranges: Array<{
        startTime: string
        endTime: string
        type: string
        title: string
        useType?: string | null
        contractStatus?: string | null
        salesName?: string | null
        createdAt?: string | null
        contactName?: string | null
        note?: string | null
      }> = []
      todayCoursesRaw
        .filter((c) => c.venueId === v.id)
        .forEach((c) =>
          ranges.push({
            startTime: c.startTime,
            endTime: c.endTime,
            type: 'course',
            title: c.title,
          }),
        )
      reservations
        .filter((r) => r.venueId === v.id)
        .forEach((r) =>
          ranges.push({
            startTime: r.startTime,
            endTime: r.endTime,
            // 区分使用类型：仅 useType=RENTAL 才计为 rental；内部使用单独一种 type
            type: (r as any).useType === 'INTERNAL' ? 'internal' : 'rental',
            title: r.eventName,
            useType: (r as any).useType ?? 'RENTAL',
            contractStatus: (r as any).contractStatus ?? null,
            salesName: (r as any).salesName ?? null,
            createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
            contactName: r.contactName ?? null,
            note: r.note ?? null,
          }),
        )
      return { name: v.name, ranges }
    })
    let occupiedSlots = 0
    venueList.forEach((v) => {
      v.ranges.forEach((r) => {
        const s = Math.max(0, toSlot(r.startTime))
        const e = Math.min(SLOT_TOTAL, toSlot(r.endTime))
        if (e > s) occupiedSlots += e - s
      })
    })

    // 最近订单（金额单位：分）
    const recentOrders = recentOrdersRaw.map((o) => ({
      id: o.id,
      user: o.user?.nickname || '匿名',
      course: o.course?.title || '订单',
      amount: orderAmountToFen(o.orderType, Number(o.actualPaid)),
    }))

    // 库存预警：按商品各自维护的安全库存判定，阈值不再写死
    const stockAlerts = stockRows
      .filter((row) => isBelowSafety(Number(row.qty), row.product.safetyStock))
      .map((row) => ({
        warehouseId: row.warehouseId,
        name: row.product.name,
        unit: row.product.unit,
        stock: Number(row.qty),
        safetyStock: row.product.safetyStock,
      }))

    /**
     * 待处理事项。全部来自待办中心，每条都带明确的处理去向：
     * 审批/入群审核进 /todos 对应详情；退款跟进、库存补货跳业务页。
     * 不再把「退款中订单」错误地指向订单列表当作审批入口。
     */
    const todoItems: { id: string; source: string; text: string; urgent: boolean; link: string }[] =
      todoPreview.items.map((it) => ({
      id: it.id,
      source: it.source,
      text: `${it.bizLabel} · ${it.summary}`,
      urgent: it.urgent,
      link: `/todos?focus=${encodeURIComponent(it.id)}`,
    }))
    if (todoPreview.counts.all > todoPreview.items.length) {
      todoItems.push({
        id: 'todo-more',
        source: 'SUMMARY',
        text: `还有 ${todoPreview.counts.all - todoPreview.items.length} 项待办未展示，去待办中心查看`,
        urgent: false,
        link: '/todos',
      })
    }

    return {
      blocks,
      stats: {
        todayCourseCount: todayCourses.length,
        todayCheckinCount,
        /** 待我审批（仅审批来源） */
        myTodoCount: todoPreview.counts.approval,
        /** 全部待办，含退款跟进/入群审核/库存预警 */
        todoCount: todoPreview.counts.all,
        /** 单位：元。无财务看板权限时给 null，前端据此不渲染这张卡 */
        monthRevenue: monthRevenueAgg ? Number(monthRevenueAgg._sum.amount ?? 0) : null,
      },
      // 有课程权限才给明细，否则只贡献上面那个条数
      todayCourses: blocks.courses ? todayCourses : [],
      venues: venueList,
      occupiedSlots,
      slotPerVenue: SLOT_TOTAL,
      totalSlots: venues.length * SLOT_TOTAL,
      recentOrders,
      stockAlerts,
      todo: todoPreview,
      todoItems,
    }
  }

  /** 近 N 天营收趋势 */
  async revenueTrend(days = 30) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'COMPLETED'] },
        paymentTime: { gte: since },
      },
      select: { actualPaid: true, paymentTime: true, orderType: true },
    })
    const map = new Map<string, number>()
    for (const o of orders) {
      if (!o.paymentTime) continue
      const key = o.paymentTime.toISOString().slice(0, 10)
      map.set(key, (map.get(key) ?? 0) + orderAmountToFen(o.orderType, Number(o.actualPaid)))
    }
    return Array.from(map.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /** 数据分析扩展图表：课程热度 / 导师评分 / 用户增长 */
  async charts() {
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const [topCourses, trainers, newUsers, reviews] = await Promise.all([
      this.prisma.course.findMany({
        where: { status: { in: ['PUBLISHED', 'COMPLETED'] } },
        orderBy: { currentEnrolled: 'desc' },
        take: 8,
        select: { id: true, title: true, currentEnrolled: true, maxCapacity: true },
      }),
      this.prisma.trainerProfile.findMany({ select: { id: true, displayName: true } }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.review.findMany({
        select: { rating: true, course: { select: { trainerId: true } } },
      }),
    ])

    // 课程热度（报名人数 Top 8）
    const coursePopularity = topCourses.map((c) => ({
      name: c.title,
      value: c.currentEnrolled,
      capacity: c.maxCapacity,
    }))

    // 导师评分（有评价的导师 Top 8）
    const ratingMap = new Map<string, { sum: number; count: number }>()
    for (const r of reviews) {
      const tid = r.course?.trainerId
      if (!tid) continue
      const cur = ratingMap.get(tid) || { sum: 0, count: 0 }
      cur.sum += r.rating
      cur.count += 1
      ratingMap.set(tid, cur)
    }
    const nameMap = new Map(trainers.map((t) => [t.id, t.displayName]))
    const trainerRatings = Array.from(ratingMap.entries())
      .map(([tid, agg]) => ({
        name: nameMap.get(tid) || '导师',
        value: Number((agg.sum / agg.count).toFixed(1)),
        count: agg.count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    // 用户增长（近 30 天每日新增）
    const growthMap = new Map<string, number>()
    for (const u of newUsers) {
      const key = u.createdAt.toISOString().slice(0, 10)
      growthMap.set(key, (growthMap.get(key) || 0) + 1)
    }
    const userGrowth = Array.from(growthMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return { coursePopularity, trainerRatings, userGrowth }
  }
}
