/**
 * 模拟演示数据脚本（可重复运行）
 * 运行：pnpm --filter server exec ts-node prisma/mock.ts
 * 说明：仅生成"演示"数据，均带可识别标记，重复运行会先清理旧的演示数据再重建。
 *  - 演示 C 端用户：手机号前缀 13910
 *  - 演示导师用户：手机号前缀 13911
 *  - 演示课程：标题在 MOCK_COURSE_TITLES 集合内
 */
import { PrismaClient, CourseType, CourseStatus, ScheduleType, OrderStatus, OrderType, CheckInMethod, VoucherStatus, TaskScope, TaskStatus } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

// 手动加载 .env.local（Prisma 默认只读 .env）
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '../.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) {
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        process.env[m[1]] = v
      }
    }
  }
}

const prisma = new PrismaClient()

const MOCK_USER_PREFIX = '13910'
const MOCK_TRAINER_PREFIX = '13911'

const MOCK_COURSE_TITLES = [
  '哈他瑜伽基础晨练',
  '流瑜伽塑形进阶',
  '阴瑜伽深度放松',
  '空中瑜伽体验课',
  '正念冥想减压工作坊',
  '孕产修复私教课',
  '肩颈理疗小班课',
  '周末瑜伽训练营',
  '零基础入门体验',
  '普拉提核心强化',
]

/** 生成本周一 00:00 */
function mondayOfThisWeek(): Date {
  const d = new Date()
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (day - 1))
  return d
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]
}
const cover = (seed: string) => `https://picsum.photos/seed/${seed}/800/500`
const gallery = (seed: string) => [1, 2, 3].map((n) => `https://picsum.photos/seed/${seed}-${n}/900/600`)

async function cleanup() {
  console.log('🧹 清理旧的演示数据...')
  const courses = await prisma.course.findMany({ where: { title: { in: MOCK_COURSE_TITLES } }, select: { id: true } })
  const courseIds = courses.map((c) => c.id)
  const mockUsers = await prisma.user.findMany({
    where: { phone: { startsWith: MOCK_USER_PREFIX } }, select: { id: true },
  })
  const mockTrainerUsers = await prisma.user.findMany({
    where: { phone: { startsWith: MOCK_TRAINER_PREFIX } }, select: { id: true },
  })
  const uids = [...mockUsers.map((u) => u.id), ...mockTrainerUsers.map((u) => u.id)]
  const trainerProfiles = await prisma.trainerProfile.findMany({
    where: { userId: { in: mockTrainerUsers.map((u) => u.id) } }, select: { id: true },
  })
  const tpIds = trainerProfiles.map((t) => t.id)

  if (courseIds.length) {
    await prisma.settlement.deleteMany({ where: { courseId: { in: courseIds } } })
    await prisma.review.deleteMany({ where: { courseId: { in: courseIds } } })
    await prisma.checkIn.deleteMany({ where: { courseId: { in: courseIds } } })
    await prisma.waitlistEntry.deleteMany({ where: { courseId: { in: courseIds } } })
    await prisma.coursePriceTier.deleteMany({ where: { courseId: { in: courseIds } } })
    await prisma.order.deleteMany({ where: { courseId: { in: courseIds } } })
  }
  if (uids.length) {
    await prisma.order.deleteMany({ where: { userId: { in: uids } } })
    await prisma.review.deleteMany({ where: { userId: { in: uids } } })
    await prisma.checkIn.deleteMany({ where: { userId: { in: uids } } })
    await prisma.pointsRecord.deleteMany({ where: { userId: { in: uids } } })
    await prisma.voucher.deleteMany({ where: { userId: { in: uids } } })
    await prisma.waitlistEntry.deleteMany({ where: { userId: { in: uids } } })
    await prisma.taskClaim.deleteMany({ where: { userId: { in: uids } } })
  }
  if (tpIds.length) {
    await prisma.seedsRecord.deleteMany({ where: { trainerId: { in: tpIds } } })
  }
  if (courseIds.length) await prisma.course.deleteMany({ where: { id: { in: courseIds } } })
  if (tpIds.length) await prisma.trainerProfile.deleteMany({ where: { id: { in: tpIds } } })
  if (uids.length) await prisma.user.deleteMany({ where: { id: { in: uids } } })
  console.log('🧹 清理完成')
}

async function main() {
  console.log('🌱 开始写入演示数据...')
  await cleanup()

  // ===== 场地 =====
  let venueMain = await prisma.venue.findFirst({ where: { name: '总店·瑜伽馆' } })
  if (!venueMain) {
    venueMain = await prisma.venue.create({
      data: { name: '总店·瑜伽馆', address: '上海市徐汇区示例路 1 号', capacity: 30, images: [], businessHours: JSON.stringify({ mon_fri: '09:00-21:00', sat_sun: '09:00-18:00' }) },
    })
  }
  let venueBranch = await prisma.venue.findFirst({ where: { name: '分店·空中瑜伽馆' } })
  if (!venueBranch) {
    venueBranch = await prisma.venue.create({
      data: { name: '分店·空中瑜伽馆', address: '上海市静安区示例路 88 号', capacity: 20, images: [], businessHours: JSON.stringify({ mon_fri: '10:00-22:00', sat_sun: '10:00-19:00' }) },
    })
  }
  const venues = [venueMain, venueBranch]
  console.log(`✅ 场地: ${venues.length}`)

  // ===== 导师（复用示例导师 + 新增两位演示导师）=====
  const trainerProfiles: { id: string; hourlyRate: number }[] = []
  const seedTrainer = await prisma.trainerProfile.findFirst({ where: { displayName: '示例导师' } })
  if (seedTrainer) trainerProfiles.push({ id: seedTrainer.id, hourlyRate: Number(seedTrainer.hourlyRate) })

  const extraTrainers = [
    { phone: MOCK_TRAINER_PREFIX + '0001', name: '林悦', level: 4, rate: 600, specialties: ['vinyasa', 'aerial'], bio: '空中瑜伽与流瑜伽资深导师。' },
    { phone: MOCK_TRAINER_PREFIX + '0002', name: '沈静', level: 2, rate: 300, specialties: ['yin', 'meditation'], bio: '阴瑜伽与冥想疗愈导师。' },
  ]
  for (const t of extraTrainers) {
    const u = await prisma.user.create({ data: { phone: t.phone, nickname: t.name, isTrainer: true } })
    const tp = await prisma.trainerProfile.create({
      data: { userId: u.id, displayName: t.name, level: t.level, specialties: t.specialties, bio: t.bio, hourlyRate: t.rate, seedsBalance: 120 },
    })
    trainerProfiles.push({ id: tp.id, hourlyRate: t.rate })
  }
  console.log(`✅ 导师: ${trainerProfiles.length}`)

  // ===== C 端用户 =====
  const userNames = ['王小雅', '李梦', '张涵', '刘晓东', '陈曦', '赵敏', '孙悦', '周婷', '吴磊', '郑爽', '钱多多', '冯洁']
  const users: { id: string }[] = []
  for (let i = 0; i < userNames.length; i++) {
    const phone = MOCK_USER_PREFIX + String(1000 + i).padStart(4, '0')
    const u = await prisma.user.create({ data: { phone, nickname: userNames[i] } })
    users.push({ id: u.id })
  }
  console.log(`✅ C端用户: ${users.length}`)

  // ===== 课程（不同状态 + 本周开课 + 不同满员率）=====
  const monday = mondayOfThisWeek()
  const coursePlans = [
    { title: MOCK_COURSE_TITLES[0], type: CourseType.SINGLE, status: CourseStatus.PUBLISHED, startOffset: 1, enrolled: 12, max: 15, price: 128, cat: ['group'], tid: 0 },
    { title: MOCK_COURSE_TITLES[1], type: CourseType.SERIES, status: CourseStatus.PUBLISHED, startOffset: 2, enrolled: 8, max: 20, price: 168, cat: ['group'], tid: 1 },
    { title: MOCK_COURSE_TITLES[2], type: CourseType.SINGLE, status: CourseStatus.PUBLISHED, startOffset: 3, enrolled: 18, max: 18, price: 118, cat: ['group'], tid: 2 },
    { title: MOCK_COURSE_TITLES[3], type: CourseType.SINGLE, status: CourseStatus.PUBLISHED, startOffset: 4, enrolled: 6, max: 12, price: 208, cat: ['workshop'], tid: 0 },
    { title: MOCK_COURSE_TITLES[4], type: CourseType.SINGLE, status: CourseStatus.PUBLISHED, startOffset: 5, enrolled: 10, max: 25, price: 98, cat: ['workshop'], tid: 2 },
    { title: MOCK_COURSE_TITLES[5], type: CourseType.SERIES, status: CourseStatus.PUBLISHED, startOffset: 14, enrolled: 4, max: 8, price: 398, cat: ['private'], tid: 1 },
    { title: MOCK_COURSE_TITLES[6], type: CourseType.SINGLE, status: CourseStatus.COMPLETED, startOffset: -7, enrolled: 10, max: 10, price: 138, cat: ['group'], tid: 0 },
    { title: MOCK_COURSE_TITLES[7], type: CourseType.SERIES, status: CourseStatus.COMPLETED, startOffset: -14, enrolled: 16, max: 20, price: 588, cat: ['camp'], tid: 1 },
    { title: MOCK_COURSE_TITLES[8], type: CourseType.SINGLE, status: CourseStatus.DRAFT, startOffset: 20, enrolled: 0, max: 15, price: 0, cat: ['group'], tid: 2 },
    { title: MOCK_COURSE_TITLES[9], type: CourseType.SINGLE, status: CourseStatus.PUBLISHED, startOffset: 6, enrolled: 14, max: 16, price: 148, cat: ['group'], tid: 0 },
  ]
  const createdCourses: { id: string; status: CourseStatus; enrolled: number; price: number; tid: number; hours: number }[] = []
  for (let i = 0; i < coursePlans.length; i++) {
    const p = coursePlans[i]
    const start = addDays(monday, p.startOffset)
    const seed = 'course' + i
    const tp = pick(trainerProfiles, p.tid)
    const c = await prisma.course.create({
      data: {
        title: p.title, coverImage: cover(seed), type: p.type, categories: p.cat,
        description: `<p>${p.title}，由资深导师带领，适合不同基础的学员循序渐进地练习。</p>`,
        targetAudience: ['瑜伽爱好者', '零基础人群'], learningGoals: '掌握基础体式与呼吸法，缓解身心压力。',
        startDate: start, endDate: p.type === CourseType.SERIES ? addDays(start, 21) : start,
        startTime: '09:30', endTime: '10:30', trainerId: tp.id,
        minCapacity: 3, maxCapacity: p.max, currentEnrolled: p.enrolled, originalPrice: p.price,
        venueId: pick(venues, i).id, status: p.status, trainerSeeds: 20, allowDeduction: true,
        gallery: gallery(seed), scheduleType: p.type === CourseType.SERIES ? ScheduleType.WEEKLY : ScheduleType.ONE_TIME,
        weekdays: p.type === CourseType.SERIES ? [1, 3, 5] : [],
      },
    })
    createdCourses.push({ id: c.id, status: p.status, enrolled: p.enrolled, price: p.price, tid: p.tid, hours: 1 })
  }
  console.log(`✅ 课程: ${createdCourses.length}（含本周开课/已完成/草稿）`)

  // ===== 报名订单 + 签到 + 评价（针对有报名的课程）=====
  let orderCount = 0, checkinCount = 0, reviewCount = 0
  const reviewTexts = ['老师很专业，课程节奏舒适，收获很大！', '环境很好，练习完全身轻松。', '动作讲解细致，适合新手。', '氛围很棒，会继续报名。', '性价比高，推荐！']
  for (let ci = 0; ci < createdCourses.length; ci++) {
    const c = createdCourses[ci]
    if (c.price <= 0 || c.enrolled <= 0) continue
    const enrollN = Math.min(c.enrolled, users.length)
    for (let u = 0; u < enrollN; u++) {
      const user = users[u]
      const isCompleted = c.status === CourseStatus.COMPLETED
      const paidStatus = isCompleted ? OrderStatus.COMPLETED : OrderStatus.PAID
      const payTime = addDays(now, -3)
      await prisma.order.create({
        data: {
          userId: user.id, courseId: c.id, orderType: OrderType.COURSE,
          originalPrice: c.price, actualPaid: c.price, status: paidStatus,
          paymentId: 'MOCKPAY' + ci + '-' + u, paymentTime: payTime,
        },
      })
      orderCount++
      if (isCompleted) {
        await prisma.checkIn.create({ data: { userId: user.id, courseId: c.id, method: CheckInMethod.MANUAL } })
        checkinCount++
        // 部分学员评价
        if (u % 2 === 0) {
          await prisma.review.create({
            data: { userId: user.id, courseId: c.id, rating: 4 + (u % 2), content: pick(reviewTexts, u) },
          })
          reviewCount++
        }
      }
    }
  }
  console.log(`✅ 报名订单: ${orderCount} / 签到: ${checkinCount} / 评价: ${reviewCount}`)

  // ===== 结算 + Seeds（已完成课程）=====
  let settlementCount = 0
  for (const c of createdCourses) {
    if (c.status !== CourseStatus.COMPLETED) continue
    const tp = pick(trainerProfiles, c.tid)
    const rate = tp.hourlyRate || 300
    await prisma.settlement.create({ data: { trainerId: tp.id, courseId: c.id, hours: c.hours, rate, amount: rate * c.hours } })
    await prisma.seedsRecord.create({ data: { trainerId: tp.id, amount: 20, balance: 140, type: 'COURSE_SETTLEMENT', reason: '课程结算奖励', relatedId: c.id } })
    settlementCount++
  }
  console.log(`✅ 结算记录: ${settlementCount}`)

  // ===== 积分记录 =====
  let pointsCount = 0
  for (let i = 0; i < users.length; i++) {
    const amount = 50 + i * 10
    await prisma.pointsRecord.create({
      data: { userId: users[i].id, amount, balance: amount, type: 'COURSE_REWARD', reason: '完成课程奖励积分' },
    })
    pointsCount++
  }
  console.log(`✅ 积分记录: ${pointsCount}`)

  // ===== 代金券 =====
  let voucherCount = 0
  for (let i = 0; i < 5; i++) {
    await prisma.voucher.create({
      data: {
        userId: users[i].id, amount: pick([20, 30, 50], i), applicableCourseIds: [], applicableAll: true,
        expiresAt: addDays(now, 30), status: VoucherStatus.UNUSED, source: '新人注册礼包',
      },
    })
    voucherCount++
  }
  console.log(`✅ 代金券: ${voucherCount}`)

  // ===== 任务 =====
  const tasks = [
    { title: '朋友圈课程海报转发', desc: '转发本周主推课程海报到朋友圈并保留 4 小时。', reward: 15, max: 50 },
    { title: '邀请好友到店体验', desc: '成功邀请 1 位新学员到店体验课程。', reward: 30, max: 30 },
    { title: '课程短视频拍摄', desc: '拍摄一条课程花絮短视频并发布至视频号。', reward: 25, max: 20 },
  ]
  for (const t of tasks) {
    await prisma.task.create({
      data: { title: t.title, description: t.desc, seedsReward: t.reward, maxParticipants: t.max, scope: TaskScope.ALL, specificTrainerIds: [], status: TaskStatus.PUBLISHED },
    })
  }
  console.log(`✅ 任务: ${tasks.length}`)

  // ===== 物料 =====
  const materials = [
    { name: '瑜伽垫（TPE）', quantity: 40, unitPrice: 89, seedsCost: 10 },
    { name: '瑜伽砖（EVA）', quantity: 80, unitPrice: 25, seedsCost: 5 },
    { name: '伸展带', quantity: 60, unitPrice: 35, seedsCost: 5 },
    { name: '按摩球', quantity: 50, unitPrice: 45, seedsCost: 8 },
  ]
  for (const m of materials) {
    const exist = await prisma.material.findFirst({ where: { name: m.name } })
    if (!exist) await prisma.material.create({ data: m })
  }
  console.log(`✅ 物料: ${materials.length}`)

  console.log('🎉 演示数据写入完成')
}

main()
  .catch((e) => {
    console.error('❌ 演示数据写入失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
