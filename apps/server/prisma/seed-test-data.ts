/**
 * 一次性测试数据脚本：为各模块造一些有意义的测试数据
 * 运行方式：npx ts-node prisma/seed-test-data.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. 获取已有场地和导师
  const venues = await prisma.venue.findMany()
  const trainers = await prisma.trainerProfile.findMany()

  if (!venues.length) {
    console.log('⚠️ 没有场地数据，请先在后台创建场地')
    return
  }
  if (!trainers.length) {
    console.log('⚠️ 没有导师数据，请先在后台创建导师')
    return
  }

  console.log(`✅ 找到 ${venues.length} 个场地, ${trainers.length} 位导师`)

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const dayAfter = new Date(today)
  dayAfter.setDate(today.getDate() + 2)

  const formatDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  // 2. 为今天、明天、后天各个场地造场地预约数据
  const reservationData = [
    // 今天
    { venueIdx: 0, date: formatDate(today), startTime: '09:00', endTime: '11:00', eventName: '企业团建瑜伽', contactName: '张三', contactPhone: '13800001111' },
    { venueIdx: 0, date: formatDate(today), startTime: '14:00', endTime: '16:00', eventName: '私人派对', contactName: '李四', contactPhone: '13800002222' },
    { venueIdx: venues.length > 1 ? 1 : 0, date: formatDate(today), startTime: '10:00', endTime: '12:00', eventName: '摄影场地租借', contactName: '王五', contactPhone: '13800003333' },
    // 明天
    { venueIdx: 0, date: formatDate(tomorrow), startTime: '08:00', endTime: '10:00', eventName: '晨间冥想沙龙', contactName: '赵六', contactPhone: '13800004444' },
    { venueIdx: 0, date: formatDate(tomorrow), startTime: '15:00', endTime: '17:30', eventName: '品牌合作拍摄', contactName: '周七', contactPhone: '13800005555' },
    { venueIdx: venues.length > 1 ? 1 : 0, date: formatDate(tomorrow), startTime: '13:00', endTime: '15:00', eventName: '瑜伽教师培训', contactName: '吴八', contactPhone: '13800006666' },
    // 后天
    { venueIdx: 0, date: formatDate(dayAfter), startTime: '09:30', endTime: '11:30', eventName: '会员体验活动', contactName: '郑九', contactPhone: '13800007777' },
  ]

  let createdReservations = 0
  for (const r of reservationData) {
    const venue = venues[r.venueIdx] || venues[0]
    // 检查是否已存在同样的预约
    const exists = await prisma.venueReservation.findFirst({
      where: { venueId: venue.id, date: r.date, startTime: r.startTime, eventName: r.eventName }
    })
    if (!exists) {
      await prisma.venueReservation.create({
        data: {
          venueId: venue.id,
          date: r.date,
          startTime: r.startTime,
          endTime: r.endTime,
          eventName: r.eventName,
          contactName: r.contactName,
          contactPhone: r.contactPhone,
        }
      })
      createdReservations++
    }
  }
  console.log(`✅ 创建了 ${createdReservations} 条场地预约`)

  // 3. 造几节不同日期的测试课程（PUBLISHED 状态）
  const courseData = [
    // 今天的课程
    { title: '流瑜伽·晨练唤醒', date: formatDate(today), startTime: '08:00', endTime: '09:30', trainerIdx: 0, venueIdx: 0, price: 12800, capacity: 8, enrolled: 3 },
    { title: '空中瑜伽·基础入门', date: formatDate(today), startTime: '16:00', endTime: '17:30', trainerIdx: trainers.length > 1 ? 1 : 0, venueIdx: venues.length > 1 ? 1 : 0, price: 19800, capacity: 6, enrolled: 5 },
    // 明天的课程
    { title: '阴瑜伽·深度放松', date: formatDate(tomorrow), startTime: '10:00', endTime: '11:30', trainerIdx: 0, venueIdx: 0, price: 15800, capacity: 10, enrolled: 4 },
    { title: '冥想正念·初级班', date: formatDate(tomorrow), startTime: '19:00', endTime: '20:30', trainerIdx: trainers.length > 1 ? 1 : 0, venueIdx: 0, price: 9800, capacity: 12, enrolled: 7 },
    // 后天的课程
    { title: '哈他瑜伽·力量塑形', date: formatDate(dayAfter), startTime: '09:00', endTime: '10:30', trainerIdx: 0, venueIdx: venues.length > 1 ? 1 : 0, price: 16800, capacity: 8, enrolled: 2 },
  ]

  let createdCourses = 0
  for (const c of courseData) {
    const trainer = trainers[c.trainerIdx] || trainers[0]
    const venue = venues[c.venueIdx] || venues[0]
    // 检查是否已存在同名课程
    const exists = await prisma.course.findFirst({
      where: { title: c.title, startDate: c.date }
    })
    if (!exists) {
      await prisma.course.create({
        data: {
          title: c.title,
          coverImage: '',
          type: 'SINGLE',
          categories: ['瑜伽'],
          description: `${c.title}课程，适合各水平学员参加`,
          targetAudience: ['瑜伽爱好者'],
          startDate: c.date,
          endDate: c.date,
          startTime: c.startTime,
          endTime: c.endTime,
          trainerId: trainer.id,
          venueId: venue.id,
          minCapacity: 3,
          maxCapacity: c.capacity,
          currentEnrolled: c.enrolled,
          originalPrice: c.price,
          status: 'PUBLISHED',
          gallery: [],
          weekdays: [],
          groupDeadline: c.date, // 开课当天就是成团截止
          refundRules: [{ hoursFrom: 48, hoursTo: 9999, refundPercent: 100 }, { hoursFrom: 24, hoursTo: 48, refundPercent: 50 }],
        }
      })
      createdCourses++
    }
  }
  console.log(`✅ 创建了 ${createdCourses} 节测试课程`)

  // 4. 造几条物料数据（用于库存预警）
  const materialData = [
    { name: '瑜伽垫（加厚款）', quantity: 3, unitPrice: 9900, seedsCost: 50 },
    { name: '瑜伽砖', quantity: 12, unitPrice: 2900, seedsCost: 15 },
    { name: '瑜伽绳', quantity: 2, unitPrice: 3900, seedsCost: 20 },
    { name: '精油香薰蜡烛', quantity: 5, unitPrice: 4900, seedsCost: 25 },
    { name: '一次性湿巾', quantity: 50, unitPrice: 500, seedsCost: 3 },
  ]

  let createdMaterials = 0
  for (const m of materialData) {
    const exists = await prisma.material.findFirst({ where: { name: m.name } })
    if (!exists) {
      await prisma.material.create({
        data: { name: m.name, quantity: m.quantity, unitPrice: m.unitPrice, seedsCost: m.seedsCost }
      })
      createdMaterials++
    }
  }
  console.log(`✅ 创建了 ${createdMaterials} 条物料数据`)

  console.log('\n🎉 测试数据创建完成！')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
