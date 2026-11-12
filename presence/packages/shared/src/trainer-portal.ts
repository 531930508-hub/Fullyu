/**
 * 导师入驻 / 课程提案（前后端共用口径）。
 *
 * 两类单据共用一套「状态 → 文案 → 颜色」映射，避免门户、后台、待办中心
 * 各写一份中文而互相打架。
 */

// ===== 导师入驻申请 =====

export type TrainerApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export const TRAINER_APPLICATION_STATUS_META: Record<
  TrainerApplicationStatus,
  { text: string; color: string }
> = {
  PENDING: { text: '待审核', color: 'gold' },
  APPROVED: { text: '已通过', color: 'green' },
  REJECTED: { text: '已驳回', color: 'red' },
}

/** 入驻申请表字段：key 与提交 JSON 一致，用于后台逐项展示与勾选驳回原因 */
export const TRAINER_APPLICATION_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'realName', label: '真实姓名' },
  { key: 'phone', label: '手机号' },
  { key: 'city', label: '所在城市' },
  { key: 'headline', label: '一句话介绍' },
  { key: 'specialties', label: '擅长方向' },
  { key: 'intro', label: '个人介绍' },
  { key: 'experienceYears', label: '从业年限' },
  { key: 'certificates', label: '资质证书' },
  { key: 'portfolio', label: '作品/证明' },
  { key: 'availableDays', label: '可授课时间' },
  { key: 'motivation', label: '为什么想加入 Full愈' },
]

// ===== 课程提案 =====

export type CourseProposalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'REJECTED'
  | 'APPROVED'
  | 'PUBLISHED'

export const COURSE_PROPOSAL_STATUS_META: Record<
  CourseProposalStatus,
  { text: string; color: string; /** 导师在门户里看到的一句话说明 */ hint: string }
> = {
  DRAFT: { text: '草稿', color: 'default', hint: '还没提交，只有你能看到' },
  SUBMITTED: { text: '待教务受理', color: 'blue', hint: '教务一般 1–2 个工作日内处理' },
  REVIEWING: { text: '教务审核中', color: 'processing', hint: '教务正在核对内容和场地' },
  REJECTED: { text: '需修改', color: 'red', hint: '按教务说明修改后可重新提交' },
  APPROVED: { text: '已通过', color: 'green', hint: '已通过审核，等待上架排期' },
  PUBLISHED: { text: '已上架', color: 'green', hint: '已上架，学员可以报名了' },
}

/** 课程提案 5 步表单 */
export const PROPOSAL_STEPS = [
  { key: 'basic', title: '课程基础信息' },
  { key: 'content', title: '课程内容与形式' },
  { key: 'outcome', title: '学员收获与成果' },
  { key: 'capacity', title: '场地与人数需求' },
  { key: 'submit', title: '确认与提交' },
] as const

export type ProposalStepKey = (typeof PROPOSAL_STEPS)[number]['key']

/** 课程分类（与后台课程表单口径一致） */
export const COURSE_CATEGORY_OPTIONS = [
  '瑜伽',
  '普拉提',
  '冥想',
  '呼吸训练',
  '身心疗愈',
  '体态调整',
  '孕产修复',
  '亲子',
]

/** 课程主题 */
export const COURSE_THEME_OPTIONS = [
  '减压放松',
  '睡眠改善',
  '体态改善',
  '核心力量',
  '产后修复',
  '情绪调节',
  '呼吸与专注',
  '入门体验',
]

/** 适合人群 */
export const TARGET_AUDIENCE_OPTIONS = [
  '零基础',
  '有练习基础',
  '久坐办公人群',
  '产后人群',
  '中老年',
  '青少年',
  '企业团队',
]

/** 希望平台提供的支持（内部字段，不对学员展示） */
export const SUPPORT_NEED_OPTIONS = [
  '场地与设备',
  '助教配合',
  '物料采购',
  '摄影/录像',
  '前期宣传',
  '价格建议',
]

/** 驳回时需要导师修改的内容项 */
export const COURSE_PROPOSAL_REJECT_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'title', label: '课程名称' },
  { key: 'coverImage', label: '封面图' },
  { key: 'theme', label: '课程主题' },
  { key: 'categories', label: '课程分类' },
  { key: 'description', label: '课程介绍' },
  { key: 'goals', label: '学员收获' },
  { key: 'requirements', label: '学员要求' },
  { key: 'duration', label: '时长与节数' },
  { key: 'capacity', label: '人数与价格建议' },
  { key: 'materials', label: '物料清单' },
]

export const courseProposalStatusText = (status: string) =>
  COURSE_PROPOSAL_STATUS_META[status as CourseProposalStatus]?.text || status

export const trainerApplicationStatusText = (status: string) =>
  TRAINER_APPLICATION_STATUS_META[status as TrainerApplicationStatus]?.text || status