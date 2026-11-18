#!/usr/bin/env node
/**
 * 在场测试环境「演示课程」造数脚本
 *
 * 用途：给 test-presence 造一批看起来像真实运营的课程（导师 / 场地 / 课程 / 阶梯价 / 详情文案 / 封面图）。
 * 不写订单、评价、代金券、候补、结算 —— 报名人数只改 courses.current_enrolled，财务口径零影响。
 *
 * 用法（必须在 apps/server 下、加载测试环境变量后执行）：
 *   cd /opt/presence-test/app/apps/server
 *   set -a && . /etc/presence-test/api.env && set +a
 *   node scripts/seed-demo-courses.js --dry-run     # 只打印将要写入的数据
 *   node scripts/seed-demo-courses.js               # 真正写入（幂等，已存在的课跳过）
 *   node scripts/seed-demo-courses.js --cleanup     # 按 [demo-seed] 标记回滚本脚本造的数据
 *
 * 图片：默认从 ../prisma/seed-assets/demo-covers|demo-avatars 读取，JPEG 转 base64 dataURL 入库
 *（测试环境 OSS 桶未授权，base64 是与现有数据一致的存法）。可用 SEED_ASSETS_DIR 覆盖目录。
 *
 * 金额单位：一律「分」。¥198 → 19800（见 packages/shared/src/money.ts）。
 */

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const MARK = '[demo-seed]'
const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')
const CLEANUP = process.argv.includes('--cleanup')
const ASSETS = process.env.SEED_ASSETS_DIR || path.join(__dirname, '..', 'prisma', 'seed-assets')

/* ------------------------------------------------------------------ */
/* 安全闸门：只允许测试库                                                */
/* ------------------------------------------------------------------ */
function assertSafeTarget() {
  const url = process.env.DATABASE_URL || ''
  const dbName = (url.match(/\/([^/?]+)(\?|$)/) || [])[1]
  if (dbName !== 'fullyu_test') {
    throw new Error(`拒绝执行：DATABASE_URL 指向「${dbName || '未知'}」，本脚本只允许 fullyu_test`)
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('拒绝执行：NODE_ENV=production')
  }
  console.log(`[安全] 目标库 = ${dbName}`)
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */
function imageDataUrl(dir, file) {
  const full = path.join(ASSETS, dir, file)
  if (!fs.existsSync(full)) throw new Error(`缺少图片：${full}`)
  return 'data:image/jpeg;base64,' + fs.readFileSync(full).toString('base64')
}

/** 相对今天的天数 → 当天 00:00（服务器本地时区） */
function dayOffset(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

/** 相对天数 + HH:mm → 具体时刻 */
function at(days, hm) {
  const d = dayOffset(days)
  const [h, m] = hm.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

function shiftMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

/** 周几（1=周一 … 7=周日） */
function isoWeekday(date) {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

const REFUND_RULES = [
  { hoursFrom: 48, hoursTo: 9999, refundPercent: 100 },
  { hoursFrom: 24, hoursTo: 48, refundPercent: 80 },
  { hoursFrom: 2, hoursTo: 24, refundPercent: 50 },
  { hoursFrom: 0, hoursTo: 2, refundPercent: 0 },
]

/* ------------------------------------------------------------------ */
/* 数据定义                                                            */
/* ------------------------------------------------------------------ */
const NEW_TRAINERS = [
  {
    displayName: '林野',
    phone: '13800138001',
    avatar: 'avatar-linye.jpg',
    headline: '颂钵与声波疗愈 · 8 年声音工作者',
    specialties: ['音疗', '颂钵', '声音疗愈'],
    bio: '曾做过电台录音师，2018 年起专注颂钵与声波共振。相信声音是最不需要学习的语言，一场音疗里，你只需要躺下、听见、然后松下来。',
    level: 4,
  },
  {
    displayName: '周舟',
    phone: '13800138002',
    avatar: 'avatar-zhouzhou.jpg',
    headline: '流瑜伽 / 阴瑜伽 · RYT500 认证',
    specialties: ['瑜伽', '流瑜伽', '阴瑜伽', '孕产'],
    bio: '练习瑜伽 11 年，教学 7 年。带课不追求体式的难度，更在意呼吸有没有跟着身体一起走。课堂上常备两块砖，因为每个人身体都不一样。',
    level: 5,
  },
  {
    displayName: '许清',
    phone: '13800138003',
    avatar: 'avatar-xuqing.jpg',
    headline: '芳香疗法 · 植物手作',
    specialties: ['芳疗', '手作', '植物调香'],
    bio: 'IFA 认证芳疗师，做了十年配方。喜欢把节气、情绪和气味放在一起讲，让每个人都能带走一瓶属于当季的味道。',
    level: 4,
  },
  {
    displayName: '陆遥',
    phone: '13800138004',
    avatar: 'avatar-luyao.jpg',
    headline: '正念冥想 · 呼吸训练',
    specialties: ['正念', '冥想', '呼吸'],
    bio: 'MBSR 正念减压课程带领者。讲话慢，课也慢——把注意力从"应该怎样"挪回"此刻怎样"，这是她每节课唯一的目标。',
    level: 4,
  },
]

const NEW_VENUE = {
  name: '露台（云阶店）',
  city: '上海',
  address: '上海市徐汇区龙华机场路 8 号 7 层露台',
  orgId: 'S001',
  capacity: 12,
  description: '7 层半开放露台，木地板，晴天有自然光，秋冬配暖炉与毛毯。适合呼吸、冥想与小班瑜伽。',
  images: [],
  businessHours: JSON.stringify({ mon_fri: '09:00-21:00', sat_sun: '09:00-18:00' }),
}

/**
 * 课程定义
 * - offset：相对今天的天数；type=SERIES 时按周顺延 totalSessions 节
 * - tiers：阶梯价（分），originalPrice 取最高档
 * - enrolled：报名人数（直接写 current_enrolled，不生成订单）
 */
const COURSES = [
  {
    title: '颂钵音疗 · 城市夜静',
    offset: 1,
    startTime: '19:30',
    endTime: '21:00',
    duration: 90,
    type: 'SINGLE',
    categories: ['音疗'],
    trainer: '林野',
    venue: '深疗（云阶店）',
    capacity: [4, 8],
    enrolled: 5,
    tiers: [{ seatFrom: 1, seatTo: 8, price: 38000 }],
    difficulty: 'BEGINNER',
    audience: ['STRESS', 'SLEEP'],
    cover: 'cover-singing-bowl.jpg',
    description:
      '下班后的一小时半，把自己交给声音。颂钵、雨棍、丁夏与低频共鸣依次铺开，身体在声音里慢慢下沉，直到呼吸变得又长又轻。',
    detailDesc:
      '这是一节可以什么都不用做的课。你只需要躺下，盖好毯子，让声音从脚底走到头顶。\n\n前半段用颂钵与雨棍做身体扫描，帮助交感神经降下来；后半段以低频共振为主，很多人会在这段睡着——睡着也没关系，结束时我们会留 10 分钟慢慢回来，喝一杯温水再走。\n\n适合：长期加班、入睡困难、脑子停不下来的人。',
    learningGoals: '掌握一个 3 分钟自我安抚的声音练习；了解自己在什么声音下最容易放松。',
    syllabus: [
      { title: '落地与呼吸', content: '仰卧，跟随引导把注意力从脚底放到头顶，让呼吸先慢下来。' },
      { title: '身体扫描', content: '用颂钵与雨棍逐段松动肩颈、胸腹与骨盆的紧张。' },
      { title: '低频共振', content: '以低音钵做全身共振，进入较深层的放松状态。' },
      { title: '回向与整理', content: '缓慢唤醒，喝温水，带走一个可以在家重复的自我练习。' },
    ],
    materials: ['颂钵与铜锣（场馆提供）', '毛毯与眼枕（场馆提供）', '建议穿宽松棉质衣物'],
    notice: '请提前 10 分钟到场，课程含仰卧环节，请勿饱腹入场；孕期或有心脏起搏器请在报名前告知。',
    enrollStartOffset: -6,
    enrollOpenAt: null,
    enrolledNote: '余 3 席',
  },
  {
    title: '晨间流瑜伽 · 身体唤醒',
    offset: 3,
    startTime: '07:30',
    endTime: '08:45',
    duration: 75,
    type: 'SINGLE',
    categories: ['瑜伽'],
    trainer: '周舟',
    venue: '在场（云阶店）',
    capacity: [4, 12],
    enrolled: 12,
    tiers: [
      { seatFrom: 1, seatTo: 4, price: 19800 },
      { seatFrom: 5, seatTo: 8, price: 22800 },
      { seatFrom: 9, seatTo: 12, price: 25800 },
    ],
    difficulty: 'BEGINNER',
    audience: ['BODY', 'EXPLORE'],
    cover: 'cover-morning-yoga.jpg',
    description:
      '在一天开始之前，先和身体打个招呼。以拜日式为主线，配合呼吸把脊柱一节节唤醒，下课后刚好来得及吃个早餐去上班。',
    detailDesc:
      '清晨的关节和头脑都比较"睡"，这节课会先从温和的猫牛与肩颈活动开始，再进入 3 轮拜日式，最后用 10 分钟坐姿呼吸收尾。\n\n动作不追求幅度，重点是让呼吸带着身体走。零基础可上，有基础的同学会在第二轮拿到更细的顺位提示。\n\n课程提供瑜伽垫与砖，教室有淋浴间，可带走一份 15 分钟的家庭晨练序列。',
    learningGoals: '独立完成一套 15 分钟晨间序列；找到拜日式中呼吸与动作的配合节奏。',
    syllabus: [
      { title: '睡醒的关节', content: '猫牛、颈部与腕关节活动，把身体从睡眠里叫起来。' },
      { title: '三轮拜日', content: '第一轮慢，第二轮稳，第三轮交给呼吸。' },
      { title: '站立与平衡', content: '战士一式、二式与树式，练脚下的稳定。' },
      { title: '坐姿收尾', content: '骨盆钟摆与 10 分钟静坐呼吸。' },
    ],
    materials: ['瑜伽垫（场馆提供）', '瑜伽砖 2 块（场馆提供）', '毛巾与水'],
    notice: '空腹或少量流食入场；教室 07:20 开门，迟到 10 分钟以上请下一节再来。',
    enrollStartOffset: -10,
    enrolledNote: '已满员',
  },
  {
    title: '芳疗手作 · 调配你的季节香气',
    offset: 4,
    startTime: '14:00',
    endTime: '16:00',
    duration: 120,
    type: 'SINGLE',
    categories: ['芳疗', '手作'],
    trainer: '许清',
    venue: '在场（云阶店）',
    capacity: [3, 10],
    enrolled: 7,
    tiers: [{ seatFrom: 1, seatTo: 10, price: 42800 }],
    difficulty: 'BEGINNER',
    audience: ['EMOTION', 'EXPLORE'],
    cover: 'cover-aroma-workshop.jpg',
    description:
      '闻香、试配、落笔，在两个小时里做出一瓶只属于自己的季节香。带走 10ml 滚珠香水与一张手写配方卡。',
    detailDesc:
      '这节课不讲化学式，讲气味怎么和记忆打交道。\n\n前半段是闻香与认识 12 支单方精油：柑橘类提神，木质类安神，花香类常见于情绪配方；中段每人做三版试香，记录前调后调的变化；最后选定一版，在老师协助下完成 10ml 滚珠调配，并写下配方卡。\n\n所有材料与器具由场馆提供，成品当天可以带走。',
    learningGoals: '认识 12 支常用单方精油；能独立调配一瓶 10ml 滚珠香。',
    syllabus: [
      { title: '气味与记忆', content: '用三支精油做盲闻，聊聊气味如何牵出记忆。' },
      { title: '认识单方', content: '12 支单方的前中后调与常见情绪配方。' },
      { title: '三版试香', content: '在老师指导下做三版小样，记录差别。' },
      { title: '调配与封装', content: '选定一版，完成 10ml 滚珠调配与配方卡。' },
    ],
    materials: ['12 支单方精油与基础油（场馆提供）', '10ml 滚珠瓶与试香纸（场馆提供）', '围裙与湿巾'],
    notice: '孕期、癫痫或对香精敏感者请提前告知；课程含精油接触，建议穿深色易清洗衣物。',
    enrollStartOffset: -4,
    enrolledNote: '余 3 席',
  },
  {
    title: '正念呼吸 · 四步入静（4 节系列）',
    offset: 6,
    startTime: '20:00',
    endTime: '21:00',
    duration: 60,
    type: 'SERIES',
    totalSessions: 4,
    categories: ['正念'],
    trainer: '陆遥',
    venue: '露台（云阶店）',
    capacity: [4, 10],
    enrolled: 6,
    tiers: [{ seatFrom: 1, seatTo: 10, price: 88000 }],
    difficulty: 'BEGINNER',
    audience: ['STRESS', 'SLEEP'],
    cover: 'cover-mindful-breathing.jpg',
    description:
      '四周，每周一次，把注意力一次次带回呼吸。不是要清空念头，而是练会「发现自己走神了，再回来」。',
    detailDesc:
      '很多人第一次冥想都会问：为什么越坐越烦？这节课不解决这个问题，而是陪你练习和它相处。\n\n四节课对应四个台阶：第 1 周学习安住于呼吸，第 2 周用身体扫描处理走神，第 3 周练习对情绪标记不加评判，第 4 周把练习带进日常动线（通勤、吃饭、睡前）。每节课 60 分钟，含 20 分钟讲解与 30 分钟实练、10 分钟答疑。\n\n建议四节连上，系列课不支持单节报名。',
    learningGoals: '建立每天 10 分钟的自练习惯；在情绪升起时能辨认并停一拍。',
    syllabus: [
      { title: '第 1 周 · 安住呼吸', content: '坐姿、手位与呼吸锚点，第一次完整 20 分钟静坐。' },
      { title: '第 2 周 · 身体扫描', content: '用身体感受代替追逐念头，处理"坐不住"。' },
      { title: '第 3 周 · 标记情绪', content: '给情绪命名，练习不评判地看见它。' },
      { title: '第 4 周 · 带进日常', content: '把练习拆进通勤、吃饭、睡前三个场景。' },
    ],
    materials: ['坐垫与毛毯（场馆提供）', '自备一本小本子记录练习'],
    notice: '系列课共 4 节，缺课不补、不顺延；露台场地雨天改至室内，会提前一天通知。',
    enrollStartOffset: -3,
    enrolledNote: '余 4 席',
  },
  {
    title: '阴瑜伽 · 深度放松',
    offset: 8,
    startTime: '19:00',
    endTime: '20:15',
    duration: 75,
    type: 'SINGLE',
    categories: ['瑜伽'],
    trainer: '周舟',
    venue: '深疗（云阶店）',
    capacity: [3, 8],
    enrolled: 3,
    tiers: [{ seatFrom: 1, seatTo: 8, price: 22800 }],
    difficulty: 'BEGINNER',
    audience: ['BODY', 'STRESS'],
    cover: 'cover-yin-yoga.jpg',
    description:
      '每个体式停留 3 到 5 分钟，用时间代替力气。深疗区的灯光会调到最暗，适合久坐、腰紧、睡不好的人。',
    detailDesc:
      '阴瑜伽的关键不是"拉到"，而是"等"。在支撑充分的体式里停留三到五分钟，让结缔组织慢慢松开，同时练习不对抗呼吸。\n\n本节以髋、脊柱与肩背为主，全部使用抱枕与毛毯支撑，不需要柔韧性基础。结束时用 10 分钟仰卧放松收尾。',
    learningGoals: '学会 5 个可在家复用的阴瑜伽体式；区分"拉伸感"和"疼痛"。',
    syllabus: [
      { title: '呼吸与支撑', content: '调整抱枕高度，找到不需要用力的姿势。' },
      { title: '髋部停留', content: '蝴蝶式、鞋带式各 4 分钟，观察髋内侧的变化。' },
      { title: '脊柱与肩背', content: '人面狮身式与扭转，缓慢进入与退出。' },
      { title: '仰卧放松', content: '10 分钟摊尸式，配低频音钵收尾。' },
    ],
    materials: ['抱枕、毛毯、瑜伽砖（场馆提供）'],
    notice: '请提前 10 分钟到场；经期与腰椎急性疼痛请提前告知老师调整体式。',
    enrollStartOffset: -5,
    enrolledNote: '余 5 席',
  },
  {
    title: '冥想与书写 · 周日静心',
    offset: 11,
    startTime: '15:00',
    endTime: '16:30',
    duration: 90,
    type: 'SINGLE',
    categories: ['正念'],
    trainer: '陆遥',
    venue: '露台（云阶店）',
    capacity: [4, 12],
    enrolled: 4,
    tiers: [{ seatFrom: 1, seatTo: 12, price: 16800 }],
    difficulty: 'BEGINNER',
    audience: ['EMOTION', 'EXPLORE'],
    cover: 'cover-journaling.jpg',
    description:
      '先静坐 20 分钟，再写 30 分钟。不写日记，不用文采，只回答三个问题。周日下午，把这一周放下来。',
    detailDesc:
      '我们很少有机会把脑子里的东西写下来。这节课用一个很朴素的流程：20 分钟静坐，30 分钟自由书写，20 分钟自愿分享。\n\n每次现场会给三个提示，例如"这周哪一刻你最想逃开""最近一次觉得被理解是什么时候"。写不完不要紧，写不出来也别着急——写下的东西不需要给任何人看。\n\n请自带一支笔，本子场馆提供，可以带走。',
    learningGoals: '掌握一个可以每周复用的静心书写流程。',
    syllabus: [
      { title: '静坐 20 分钟', content: '稳定呼吸，让脑子里的噪音先落一落。' },
      { title: '自由书写 30 分钟', content: '按现场三个提示写，不停笔、不修改。' },
      { title: '停留与回看', content: '读一遍自己写的，圈出一句最想留下的话。' },
      { title: '自愿分享', content: '愿意的同学用一分钟分享感受，不评论、不建议。' },
    ],
    materials: ['书写本（场馆提供，可带走）', '自备一支顺手的笔', '热茶'],
    notice: '露台场地视天气开放，雨天改至室内；分享环节完全自愿。',
    enrollStartOffset: -2,
    enrolledNote: '余 8 席',
  },
  {
    title: '女性瑜伽 · 骨盆养护（4 节系列）',
    offset: 13,
    startTime: '19:30',
    endTime: '20:45',
    duration: 75,
    type: 'SERIES',
    totalSessions: 4,
    categories: ['瑜伽'],
    trainer: '周舟',
    venue: '在场（云阶店）',
    capacity: [4, 10],
    enrolled: 8,
    tiers: [{ seatFrom: 1, seatTo: 10, price: 98000 }],
    difficulty: 'INTERMEDIATE',
    audience: ['BODY', 'EMOTION'],
    cover: 'cover-womens-yoga.jpg',
    description:
      '围绕骨盆与盆底的四节课：呼吸、稳定、放松、整合。适合产后恢复期、久坐与经期腰酸的人。',
    detailDesc:
      '女性身体的问题很少只出现在一处。这四节课把注意力放在骨盆周边：先找呼吸与膈肌的联动，再练髋周稳定，然后是盆底的放松与激活，最后整合到日常站姿与坐姿。\n\n课程不涉及高强度体式，节奏偏慢。产后建议满 6 周（顺产）或 8 周（剖腹产）并取得医生许可后参加。',
    learningGoals: '建立盆底感知；掌握 4 组可在家的骨盆养护练习。',
    syllabus: [
      { title: '第 1 节 · 呼吸与膈肌', content: '找到肋式呼吸与盆底的联动。' },
      { title: '第 2 节 · 髋周稳定', content: '臀中肌与深层外旋肌的激活。' },
      { title: '第 3 节 · 盆底放松', content: '学会"松开"比"收紧"更难的部分。' },
      { title: '第 4 节 · 整合到日常', content: '站姿、坐姿与抱娃姿势的调整。' },
    ],
    materials: ['瑜伽垫、砖、抱枕（场馆提供）', '建议穿贴身运动裤'],
    notice: '孕期不适合本课程；产后请确认已获医生许可。系列课缺课不补。',
    enrollStartOffset: -3,
    enrolledNote: '余 2 席',
  },
  {
    title: '双人搭档瑜伽 · 信任与支撑',
    offset: 16,
    startTime: '18:30',
    endTime: '20:00',
    duration: 90,
    type: 'SINGLE',
    categories: ['瑜伽'],
    trainer: '周舟',
    venue: '露台（云阶店）',
    capacity: [4, 12],
    enrolled: 8,
    tiers: [{ seatFrom: 1, seatTo: 12, price: 35800 }],
    difficulty: 'INTERMEDIATE',
    audience: ['BODY', 'EMOTION'],
    cover: 'cover-partner-yoga.jpg',
    description:
      '两个人一组，一个人支撑，一个人打开。带上朋友、伴侣或同事都行，单人报名现场也会配对。',
    detailDesc:
      '搭档瑜伽最难的从来不是体式，是把重量交给别人。这节课从简单的背靠背呼吸开始，逐步进入双人前屈、双人扭转与支撑后弯，每个体式都交换角色。\n\n过程中会反复确认：对方的手在哪里、压力够不够、要不要退回一点。这也是这节课真正想练的部分。\n\n票价按人计算，两人成行；现场会为单人报名的同学配对。',
    learningGoals: '学会用语言与触碰沟通边界；掌握 6 组双人练习。',
    syllabus: [
      { title: '背靠背呼吸', content: '感受对方的呼吸节奏，先建立同频。' },
      { title: '双人前屈与扭转', content: '一人支撑、一人延展，交换角色。' },
      { title: '支撑后弯', content: '在保护下打开胸腔，学习"交出重量"。' },
      { title: '收尾对话', content: '用三句话说出这 90 分钟里最真实的感受。' },
    ],
    materials: ['瑜伽垫与抱枕（场馆提供）', '建议两人同行'],
    notice: '票价按人计算；有肩颈或腰椎伤病史请提前告知。露台场地雨天改室内。',
    enrollStartOffset: -1,
    enrolledNote: '余 4 席',
  },
  {
    title: '冬至音疗 · 长夜与光',
    offset: 20,
    startTime: '19:30',
    endTime: '21:00',
    duration: 90,
    type: 'SINGLE',
    categories: ['音疗'],
    trainer: '林野',
    venue: '深疗（云阶店）',
    capacity: [4, 8],
    enrolled: 1,
    tiers: [{ seatFrom: 1, seatTo: 8, price: 39800 }],
    difficulty: 'BEGINNER',
    audience: ['SLEEP', 'EMOTION'],
    cover: 'cover-winter-soundbath.jpg',
    description:
      '一年里夜最长的一天，用一场音疗把这一年收起来。烛光、颂钵与一段很长的静默。',
    detailDesc:
      '冬至是节气的转折点，也是很多人愿意停下来回顾的时刻。\n\n这场音疗会用颂钵、丁夏与人声泛音做一段约 60 分钟的声音旅程，比常规音疗更长、更暗、更静；结束后留 20 分钟，写下一件今年想带走的事和一件想放下的事，一起烧掉那张纸。\n\n请穿深色宽松衣物，场馆会准备姜茶。',
    learningGoals: '用一个仪式感的方式结束一年；带走一段可在家使用的静心音频。',
    syllabus: [
      { title: '入场与安顿', content: '烛光下找到位置，喝一杯姜茶，躺下。' },
      { title: '声音旅程', content: '颂钵、丁夏与人声泛音，约 60 分钟。' },
      { title: '静默 5 分钟', content: '让声音停下来，听一下房间里的静。' },
      { title: '书写与放下', content: '写下带走与放下各一件，投入火盆。' },
    ],
    materials: ['颂钵与乐器（场馆提供）', '毛毯与眼枕（场馆提供）', '深色宽松衣物'],
    notice: '课程含强低频与长时间仰卧，孕期、癫痫或装有起搏器请勿参加。',
    enrollOpenAt: 0, // 今天 09:00 刚开放报名
    enrolledNote: '刚开放报名',
  },
]

/* ------------------------------------------------------------------ */
/* 清理                                                                */
/* ------------------------------------------------------------------ */
async function cleanup() {
  const courses = await prisma.course.findMany({
    where: { internalNote: { startsWith: MARK } },
    select: { id: true, title: true },
  })
  console.log(`[清理] 命中 ${courses.length} 门演示课程`)
  if (DRY_RUN) {
    courses.forEach((c) => console.log(`  - ${c.title}`))
    return
  }
  const ids = courses.map((c) => c.id)
  await prisma.coursePriceTier.deleteMany({ where: { courseId: { in: ids } } })
  await prisma.course.deleteMany({ where: { id: { in: ids } } })

  const trainers = await prisma.trainerProfile.findMany({
    where: { displayName: { in: NEW_TRAINERS.map((t) => t.displayName) } },
    select: { id: true, displayName: true, userId: true },
  })
  for (const t of trainers) {
    await prisma.trainerProfile.delete({ where: { id: t.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: t.userId } }).catch(() => {})
    console.log(`  - 导师 ${t.displayName}`)
  }
  await prisma.venue.deleteMany({ where: { name: NEW_VENUE.name } })
  console.log('[清理] 完成（导师「桃子」的补全资料保留）')
}

/* ------------------------------------------------------------------ */
/* 写入                                                                */
/* ------------------------------------------------------------------ */
async function upsertTrainer(def) {
  const existing = await prisma.trainerProfile.findUnique({ where: { displayName: def.displayName } })
  if (existing) {
    console.log(`[导师] 已存在，跳过：${def.displayName}`)
    return existing
  }
  const avatar = imageDataUrl('demo-avatars', def.avatar)
  if (DRY_RUN) {
    console.log(`[导师] 将新增：${def.displayName}（${def.headline}）`)
    return { id: `<dry-${def.displayName}>` }
  }
  const user = await prisma.user.create({
    data: { phone: def.phone, nickname: def.displayName, isTrainer: true, avatar },
  })
  const profile = await prisma.trainerProfile.create({
    data: {
      userId: user.id,
      displayName: def.displayName,
      avatar,
      level: def.level,
      seedifyCert: true,
      certBadge: '认证导师',
      specialties: def.specialties,
      bio: def.bio,
      headline: def.headline,
      city: '上海',
      hourlyRate: 0,
    },
  })
  console.log(`[导师] + ${def.displayName}`)
  return profile
}

/** 补全已有导师「桃子」的对外资料（不覆盖已有内容） */
async function enrichExistingTrainer() {
  const t = await prisma.trainerProfile.findUnique({ where: { displayName: '桃子' } })
  if (!t) return
  const patch = {}
  if (!t.headline) patch.headline = '艺术疗愈 / 人生教练 · 正念练习者'
  if (!t.city) patch.city = '上海'
  if (!t.bio) {
    patch.bio =
      '以艺术与香气为媒介做身心工作，带课六年。相信表达不一定靠语言，一幅画、一瓶香气也能把话说完。'
  }
  if (!Object.keys(patch).length) {
    console.log('[导师] 桃子资料已完整，跳过')
    return
  }
  console.log('[导师] 补全桃子:', Object.keys(patch).join(', '))
  if (!DRY_RUN) await prisma.trainerProfile.update({ where: { id: t.id }, data: patch })
}

async function ensureVenue() {
  const existing = await prisma.venue.findFirst({ where: { name: NEW_VENUE.name } })
  if (existing) {
    console.log(`[场地] 已存在：${NEW_VENUE.name}`)
    return existing
  }
  console.log(`[场地] 将新增：${NEW_VENUE.name}（${NEW_VENUE.city} · ${NEW_VENUE.capacity} 人）`)
  if (DRY_RUN) return { id: '<dry-venue>' }
  return prisma.venue.create({ data: NEW_VENUE })
}

function buildCoursePayload(def, trainerId, venueId) {
  const start = at(def.offset, def.startTime)
  const end = def.type === 'SERIES' ? dayOffset(def.offset + (def.totalSessions - 1) * 7) : start
  const cover = imageDataUrl('demo-covers', def.cover)
  const maxTier = def.tiers.reduce((m, t) => Math.max(m, t.price), 0)
  const enrollStartAt =
    def.enrollOpenAt != null ? at(def.enrollOpenAt, '09:00') : at(def.enrollStartOffset, '10:00')

  return {
    title: def.title,
    coverImage: cover,
    coverType: 'upload',
    coverColor: 'linear-gradient(135deg, #6B463C, #8B6354)',
    type: def.type,
    categories: def.categories,
    description: def.description,
    detailDesc: def.detailDesc,
    targetAudience: def.audience,
    learningGoals: def.learningGoals,
    startDate: start,
    endDate: end,
    startTime: def.startTime,
    endTime: def.endTime,
    trainerId,
    venueId,
    minCapacity: def.capacity[0],
    maxCapacity: def.capacity[1],
    currentEnrolled: def.enrolled,
    originalPrice: maxTier,
    status: 'PUBLISHED',
    trainerSeeds: 50,
    allowDeduction: true,
    internalNote: `${MARK} 演示课程，报名人数为造数结果，无对应订单`,
    enrollStartAt,
    enrollEndAt: shiftMinutes(at(def.offset, def.startTime), -120),
    memberEnrollStartAt: shiftMinutes(enrollStartAt, -2 * 24 * 60),
    refundRules: REFUND_RULES,
    gallery: [cover],
    scheduleType: def.type === 'SERIES' ? 'WEEKLY' : 'ONE_TIME',
    weekdays: def.type === 'SERIES' ? [isoWeekday(start)] : [],
    waitlistEnabled: true,
    waitlistDeadlineHours: 12,
    memberWaitlistSeats: 3,
    difficulty: def.difficulty,
    duration: def.duration,
    totalSessions: def.type === 'SERIES' ? def.totalSessions : 1,
    materials: def.materials,
    voucherPolicy: 'ALL',
    seedsReward: 20,
    reviewSeeds: 10,
    syllabus: def.syllabus,
    notice: def.notice,
  }
}

async function seed() {
  await enrichExistingTrainer()

  const trainerIds = {}
  for (const def of NEW_TRAINERS) {
    const t = await upsertTrainer(def)
    trainerIds[def.displayName] = t.id
  }

  // 已有导师：桃子 / 示例导师
  const existingTrainers = await prisma.trainerProfile.findMany({
    select: { id: true, displayName: true },
  })
  existingTrainers.forEach((t) => {
    trainerIds[t.displayName] = t.id
  })

  const venue = await ensureVenue()
  const venues = await prisma.venue.findMany({ select: { id: true, name: true } })
  const venueIds = {}
  venues.forEach((v) => {
    venueIds[v.name] = v.id
  })
  if (DRY_RUN) venueIds[NEW_VENUE.name] = venue.id

  for (const def of COURSES) {
    const trainerId = trainerIds[def.trainer]
    const venueId = venueIds[def.venue]
    if (!trainerId) throw new Error(`课程「${def.title}」找不到导师：${def.trainer}`)
    if (!venueId) throw new Error(`课程「${def.title}」找不到场地：${def.venue}`)

    const exists = await prisma.course.findFirst({ where: { title: def.title, internalNote: { startsWith: MARK } } })
    if (exists) {
      console.log(`[课程] 已存在，跳过：${def.title}`)
      continue
    }

    const payload = buildCoursePayload(def, trainerId, venueId)
    const start = payload.startDate
    const label = `${start.getMonth() + 1}/${start.getDate()} ${def.startTime} · ${def.trainer} @ ${def.venue} · ¥${payload.originalPrice / 100} · ${def.enrolled}/${def.capacity[1]}（${def.enrolledNote}）`
    if (DRY_RUN) {
      console.log(`[课程] 将新增：${def.title}\n         ${label}`)
      continue
    }
    const course = await prisma.course.create({ data: payload, select: { id: true } })
    await prisma.coursePriceTier.createMany({
      data: def.tiers.map((t) => ({ courseId: course.id, ...t })),
    })
    console.log(`[课程] + ${def.title}  ${label}`)
  }
}

/* ------------------------------------------------------------------ */
async function main() {
  assertSafeTarget()
  if (DRY_RUN) console.log('[模式] dry-run，不会写库')
  if (CLEANUP) {
    await cleanup()
  } else {
    await seed()
  }
}

main()
  .catch((e) => {
    console.error('失败:', e.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })