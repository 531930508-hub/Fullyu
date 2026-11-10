/**
 * 测试期演示金额下调脚本：把所有 C 端应付金额压到 ¥0.10 以内，便于真实支付联调。
 *
 * 用法（必须先就地加载环境变量）：
 *   cd apps/server && set -a && . ./.env.local; set +a
 *   node scripts/demo-amounts.js dump              # 只读导出当前金额 + 落备份文件
 *   node scripts/demo-amounts.js apply             # 备份后下调金额
 *   node scripts/demo-amounts.js restore <file>    # 用备份文件回滚
 *
 * 金额单位（务必对照 packages/shared/src/money.ts，不同字段单位不同）：
 *   courses.original_price        分
 *   course_price_tiers.price     分
 *   waitlist_entries.locked_price 分
 *   communities.yearly_fee        分（int 列）
 *   member_card_products.price   元
 *   vouchers.amount/target_price  元（后台按元录入，入课程链时乘 100）
 *   orders.*                      COURSE/WAITLIST/COMMUNITY 为分，MEMBER_CARD 为元
 *
 * 安全边界：只改 C 端应付价字段与 PENDING_PAYMENT 订单；
 * 绝不碰已付款/已退款订单、结算单与财务台账，绝不执行 DDL。
 */

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const { isFenDenominatedOrder } = require('@fullyu/shared')

const prisma = new PrismaClient()

/** 目标上限：0.10 元 */
const CAP_YUAN = 0.1
const BACKUP_DIR = path.join(__dirname, '..', 'prisma', 'backups')

/** 元 → 该字段存储单位 */
function toColumn(yuan, unit) {
  return unit === 'fen' ? Math.round(yuan * 100) : Number(yuan.toFixed(2))
}

/** 该字段存储单位 → 元（仅用于打印） */
function toYuan(value, unit) {
  const n = Number(value) || 0
  return unit === 'fen' ? n / 100 : n
}

/**
 * 把一组价格按原有高低顺序映射到 0.05 ~ 0.10 元，
 * 保留「原来贵的仍然更贵」的相对关系，避免演示数据失真。
 *
 * 下限取 0.05 而不是 0.01：订单实付走 Math.max(0, 原价-抵扣)，
 * 而支付网关拒绝 totalFen <= 0。留 5 分空间，代金券（抵扣 0.02 /
 * 减至 0.05）生效后实付仍然大于 0，否则券类订单会直接付不出去。
 */
const FLOOR_YUAN = 0.05
function bucketYuan(index, total) {
  if (total <= 1) return CAP_YUAN
  const steps = Math.round((CAP_YUAN - FLOOR_YUAN) * 100)
  return Number(
    ((Math.round((index / (total - 1)) * steps) + FLOOR_YUAN * 100) / 100).toFixed(2),
  )
}

async function collect() {
  const [courses, tiers, cardProducts, communities, waitlists, vouchers, pendingOrders] =
    await Promise.all([
      prisma.course.findMany({ select: { id: true, title: true, originalPrice: true } }),
      prisma.coursePriceTier.findMany({
        select: { id: true, courseId: true, seatFrom: true, seatTo: true, price: true },
      }),
      prisma.memberCardProduct.findMany({
        select: { id: true, name: true, type: true, durationDays: true, price: true },
      }),
      prisma.community.findMany({ select: { id: true, name: true, yearlyFee: true } }),
      prisma.waitlistEntry.findMany({
        select: { id: true, courseId: true, status: true, lockedPrice: true },
      }),
      prisma.voucher.findMany({
        select: {
          id: true,
          source: true,
          mode: true,
          amount: true,
          targetPrice: true,
          status: true,
        },
      }),
      prisma.order.findMany({
        where: { status: 'PENDING_PAYMENT' },
        select: {
          id: true,
          orderNo: true,
          orderType: true,
          originalPrice: true,
          discountAmount: true,
          pointsDeduction: true,
          voucherDeduction: true,
          actualPaid: true,
          platformFee: true,
        },
      }),
    ])
  return { courses, tiers, cardProducts, communities, waitlists, vouchers, pendingOrders }
}

function summarize(snapshot) {
  const rows = [
    ['courses.original_price', snapshot.courses.map(c => c.originalPrice), 'fen'],
    ['course_price_tiers.price', snapshot.tiers.map(t => t.price), 'fen'],
    ['member_card_products.price', snapshot.cardProducts.map(p => p.price), 'yuan'],
    ['communities.yearly_fee', snapshot.communities.map(c => c.yearlyFee), 'fen'],
    ['waitlist_entries.locked_price', snapshot.waitlists.map(w => w.lockedPrice), 'fen'],
    ['vouchers.amount', snapshot.vouchers.map(v => v.amount), 'yuan'],
    [
      'orders(待支付).actual_paid',
      snapshot.pendingOrders.map(o =>
        isFenDenominatedOrder(o.orderType) ? Number(o.actualPaid) / 100 : Number(o.actualPaid),
      ),
      'yuan',
    ],
  ]
  for (const [label, values, unit] of rows) {
    const yuans = values.map(v => (label.startsWith('orders') ? Number(v) : toYuan(v, unit)))
    const min = yuans.length ? Math.min(...yuans) : null
    const max = yuans.length ? Math.max(...yuans) : null
    const range = yuans.length ? `${min} ~ ${max}` : '—'
    console.log(`${label.padEnd(30)} ${String(values.length).padStart(3)} 行  ${range} 元`)
  }
}

function writeBackup(snapshot) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  const file = path.join(BACKUP_DIR, `demo-amounts-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2))
  console.log(`已备份到 ${file}`)
  return file
}

async function apply(snapshot) {
  // 课程价（分）：按原价升序映射，低价仍低
  const courses = [...snapshot.courses].sort(
    (a, b) => Number(a.originalPrice) - Number(b.originalPrice),
  )
  const coursePriceFen = new Map()
  for (let i = 0; i < courses.length; i++) {
    const fen = toColumn(bucketYuan(i, courses.length), 'fen')
    coursePriceFen.set(courses[i].id, fen)
    await prisma.course.update({ where: { id: courses[i].id }, data: { originalPrice: fen } })
  }
  console.log(`courses.original_price      已更新 ${courses.length} 行`)

  // 阶梯价（分）：同一课程内保持升序，且不超过课程价
  const byCourse = new Map()
  for (const tier of snapshot.tiers) {
    if (!byCourse.has(tier.courseId)) byCourse.set(tier.courseId, [])
    byCourse.get(tier.courseId).push(tier)
  }
  let tierCount = 0
  for (const [courseId, tiers] of byCourse) {
    const ceiling = coursePriceFen.get(courseId) ?? toColumn(CAP_YUAN, 'fen')
    const sorted = [...tiers].sort((a, b) => Number(a.price) - Number(b.price))
    for (let i = 0; i < sorted.length; i++) {
      const fen = Math.max(1, Math.min(ceiling, toColumn(bucketYuan(i, sorted.length), 'fen')))
      await prisma.coursePriceTier.update({ where: { id: sorted[i].id }, data: { price: fen } })
      tierCount++
    }
  }
  console.log(`course_price_tiers.price    已更新 ${tierCount} 行`)

  // 会员卡商品价（元）：按时长升序映射，长卡仍更贵
  const cards = [...snapshot.cardProducts].sort(
    (a, b) => Number(a.durationDays ?? 0) - Number(b.durationDays ?? 0),
  )
  for (let i = 0; i < cards.length; i++) {
    const yuan = toColumn(bucketYuan(i, cards.length), 'yuan')
    await prisma.memberCardProduct.update({ where: { id: cards[i].id }, data: { price: yuan } })
  }
  console.log(`member_card_products.price  已更新 ${cards.length} 行`)

  // 社群年费（分，int）：免费社群保持 0
  const paidCommunities = snapshot.communities.filter(c => Number(c.yearlyFee) > 0)
  const sortedCommunities = [...paidCommunities].sort(
    (a, b) => Number(a.yearlyFee) - Number(b.yearlyFee),
  )
  for (let i = 0; i < sortedCommunities.length; i++) {
    const fen = toColumn(bucketYuan(i, sortedCommunities.length), 'fen')
    await prisma.community.update({
      where: { id: sortedCommunities[i].id },
      data: { yearlyFee: fen },
    })
  }
  console.log(
    `communities.yearly_fee      已更新 ${sortedCommunities.length} 行（免费社群 ${snapshot.communities.length - sortedCommunities.length} 行保持 0）`,
  )

  // 候补锁价（分）：跟随新的课程价，保证递补后金额一致
  for (const entry of snapshot.waitlists) {
    const fen = coursePriceFen.get(entry.courseId) ?? toColumn(CAP_YUAN, 'fen')
    await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { lockedPrice: fen } })
  }
  console.log(`waitlist_entries.locked_price 已更新 ${snapshot.waitlists.length} 行`)

  // 代金券（元）：抵扣额与减至价都压到分级，保证抵扣后仍 > 0
  for (const voucher of snapshot.vouchers) {
    await prisma.voucher.update({
      where: { id: voucher.id },
      data: {
        amount: 0.02,
        targetPrice: voucher.targetPrice === null ? null : 0.05,
      },
    })
  }
  console.log(`vouchers.amount/target      已更新 ${snapshot.vouchers.length} 行`)

  // 待支付订单：按订单类型选单位，实付兜底 1 分
  for (const order of snapshot.pendingOrders) {
    const unit = isFenDenominatedOrder(order.orderType) ? 'fen' : 'yuan'
    const originalPrice = toColumn(CAP_YUAN, unit)
    const floor = toColumn(FLOOR_YUAN, unit)
    const discountAmount = 0
    const pointsDeduction = 0
    const voucherDeduction = 0
    const actualPaid = Math.max(
      floor,
      originalPrice - discountAmount - pointsDeduction - voucherDeduction,
    )
    await prisma.order.update({
      where: { id: order.id },
      data: {
        originalPrice,
        discountAmount,
        pointsDeduction,
        voucherDeduction,
        actualPaid,
        platformFee:
          order.orderType === 'COMMUNITY' ? toColumn(toYuan(actualPaid, unit) * 0.1, unit) : 0,
      },
    })
  }
  console.log(`orders(待支付)               已更新 ${snapshot.pendingOrders.length} 行`)
}

async function restore(file) {
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const c of snapshot.courses) {
    await prisma.course.update({
      where: { id: c.id },
      data: { originalPrice: c.originalPrice },
    })
  }
  for (const t of snapshot.tiers) {
    await prisma.coursePriceTier.update({ where: { id: t.id }, data: { price: t.price } })
  }
  for (const p of snapshot.cardProducts) {
    await prisma.memberCardProduct.update({ where: { id: p.id }, data: { price: p.price } })
  }
  for (const c of snapshot.communities) {
    await prisma.community.update({ where: { id: c.id }, data: { yearlyFee: c.yearlyFee } })
  }
  for (const w of snapshot.waitlists) {
    await prisma.waitlistEntry.update({
      where: { id: w.id },
      data: { lockedPrice: w.lockedPrice },
    })
  }
  for (const v of snapshot.vouchers) {
    await prisma.voucher.update({
      where: { id: v.id },
      data: { amount: v.amount, targetPrice: v.targetPrice },
    })
  }
  for (const o of snapshot.pendingOrders) {
    await prisma.order.update({
      where: { id: o.id },
      data: {
        originalPrice: o.originalPrice,
        discountAmount: o.discountAmount,
        pointsDeduction: o.pointsDeduction,
        voucherDeduction: o.voucherDeduction,
        actualPaid: o.actualPaid,
        platformFee: o.platformFee,
      },
    })
  }
  console.log('已按备份回滚')
}

async function main() {
  const mode = process.argv[2] || 'dump'
  if (mode === 'restore') {
    const file = process.argv[3]
    if (!file) throw new Error('restore 需要备份文件路径')
    await restore(file)
    return
  }
  const snapshot = await collect()
  writeBackup(snapshot)
  console.log('== 当前 ==')
  summarize(snapshot)
  if (mode !== 'apply') return
  console.log('== 下调 ==')
  await apply(snapshot)
  console.log('== 结果 ==')
  summarize(await collect())
}

main()
  .catch(e => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
