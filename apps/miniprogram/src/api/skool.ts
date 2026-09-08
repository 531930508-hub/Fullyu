/**
 * 社群模块 API 层（国内版 Skool，已接入真实后端 /communities）。
 *
 * 产品决策（用户拍板 + 2026-08 会议逐字稿校准）：
 * - 社群是独立实体：导师借平台承载自己的个人品牌与用户；
 * - 一个导师可创建多个社群；入会费主口径是年费；
 * - 创建/发帖均过平台审核（先审后发）；
 * - 用户侧激励体系叫「大富翁体系」，导师侧联盟叫 Cdify，两套分开命名。
 *
 * 金额口径与全站一致：分。
 * 排序策略（新社群加权等）为服务端内部逻辑，不向 C 端透出。
 */

import { get, post, del } from '@/utils/request'

// ==================== 类型定义 ====================

export interface Community {
  id: string
  name: string
  slogan: string
  category: string
  /** 16:9 封面（主理人上传），可能为空，用 coverFallback 兜底 */
  cover: string
  coverFallback: string
  owner: { name: string; title: string; avatar: string }
  memberCount: number
  /** 年费（分），0 = 免费 */
  yearlyFee: number
  isOfficial: boolean
  tags: string[]
  description: string
  /** 今日活跃成员数 */
  activeToday: number
  createdAt?: string
}

export interface CommunityEvent {
  id: string
  /** YYYY-MM-DD */
  date: string
  fullDate: string
  /** HH:mm */
  time: string
  title: string
  /** OFFLINE=线下课程/活动，LIVE=直播，ONLINE=线上 */
  type: 'OFFLINE' | 'LIVE' | 'ONLINE'
  venue: string
  joined: number
  capacity: number
  /** 关联官方课程：存在时 C 端点击直接跳课程页报名 */
  courseId: string
}

export interface CommunityPost {
  id: string
  author: { name: string; role: '主理人' | '成员'; avatar: string; level: number }
  /** ISO 时间 */
  time: string
  content: string
  images: string[]
  likes: number
  comments: number
  liked: boolean
}

export interface CommunityMember {
  id: string
  name: string
  avatar: string
  joinedAt: string
}

export const COMMUNITY_CATEGORIES = ['全部', '疗愈', '瑜伽', '身心成长', '手作', '健身']

export type CommunitySort = 'recommend' | 'newest' | 'hot'

// ==================== 查询接口 ====================

/** 社群广场（仅上架社群；排序由服务端处理） */
export function fetchCommunities(category = '全部', keyword = '', sort: CommunitySort = 'recommend') {
  return get<Community[]>('/communities', { category, keyword, sort }, { auth: false, silent: true })
}

/** 社群详情 */
export function fetchCommunity(id: string) {
  return get<Community>(`/communities/${id}`, undefined, { auth: false, silent: true })
}

/** 我与社群的关系：{ joined, managed }（需登录，静默） */
export function fetchMembership(id: string) {
  return get<{ joined: boolean; managed: boolean }>(`/communities/${id}/membership`, undefined, { silent: true })
}

/** 活动日历数据 */
export function fetchEvents(id: string) {
  return get<CommunityEvent[]>(`/communities/${id}/events`, undefined, { auth: false, silent: true })
}

/** 社群动态（已发布） */
export function fetchPosts(id: string) {
  return get<CommunityPost[]>(`/communities/${id}/posts`, undefined, { auth: false, silent: true })
}

/** 社群成员 */
export function fetchMembers(id: string) {
  return get<CommunityMember[]>(`/communities/${id}/members`, undefined, { auth: false, silent: true })
}

/** 我的社群：{ managed, joined } */
export function fetchMine() {
  return get<{ managed: Community[]; joined: Community[] }>('/communities/mine', undefined, { silent: true })
}

// ==================== 用户操作 ====================

export function joinCommunity(id: string) {
  return post<{ joined: boolean }>(`/communities/${id}/join`)
}

export function leaveCommunity(id: string) {
  return del<{ joined: boolean }>(`/communities/${id}/join`)
}

/** 主理人创建社群（提交平台审核） */
export function submitCommunity(body: {
  name: string
  slogan: string
  category: string
  tags: string[]
  yearlyFee: number
  description?: string
}) {
  return post<{ id: string; status: string }>('/communities', body)
}

/** 发布动态（先审后发） */
export function submitPost(communityId: string, content: string) {
  return post<{ success: boolean }>(`/communities/${communityId}/posts`, { content })
}

// ==================== 互动玩法（大富翁体系，demo 阶段前端本地维护） ====================

export interface LevelReward {
  level: number
  title: string
  reward: string
  pointsNeed: number
}

/** 等级奖励：积分升级解锁权益 */
export const LEVEL_REWARDS: LevelReward[] = [
  { level: 1, title: '新芽', reward: '加入社群，可参与公开共修', pointsNeed: 0 },
  { level: 2, title: '同行者', reward: '解锁：每月 1 次导师直播连麦提问', pointsNeed: 1000 },
  { level: 3, title: '精进者', reward: '解锁：进阶课程模块 + 个案督导小组', pointsNeed: 2000 },
  { level: 4, title: '共建者', reward: '解锁：线下工作坊优先报名 + 8 折', pointsNeed: 4000 },
  { level: 5, title: '种子导师', reward: '解锁：邀请好友入会额外积分 + 导师联盟面试资格', pointsNeed: 8000 },
]

export interface PointsUse {
  icon: string
  title: string
  desc: string
  cost?: number
}

/** 积分用途 */
export const POINTS_USES: PointsUse[] = [
  { icon: '🎟️', title: '兑换活动名额', desc: '线下工作坊/共修场次，用积分直接换票' },
  { icon: '📚', title: '兑换加餐课程', desc: '主理人发布的进阶加餐内容，不占订阅权益' },
  { icon: '☕', title: '兑换导师 1v1', desc: '15 分钟一对一答疑时段，由主理人定价' },
  { icon: '🎁', title: '积分商城', desc: '品牌周边/材料包/代金券，按社群自定义上架' },
  { icon: '🚀', title: '升级解锁权益', desc: '等级 LV1-5，越高权益越多（见等级奖励）' },
]

/** 每日一题（答对加分） */
export interface QuizQuestion {
  question: string
  options: string[]
  answer: number
  explain: string
}

export const DAILY_QUIZ: QuizQuestion = {
  question: '「3 分钟呼吸空间」练习的第一步是什么？',
  options: ['觉察当下的想法与感受', '深呼吸十次', '闭眼数息', '朗读引导词'],
  answer: 0,
  explain: '第一步是停下来觉察：此刻的想法、情绪、身体感受，不做评判。',
}

/** 每日打卡：连续打卡有额外奖励 */
export const CHECKIN = {
  streak: 4,
  rewardToday: 5,
  streakBonus: { days: 7, bonus: 30 },
}

/** 21 天挑战 */
export const CHALLENGE = {
  title: '21 天清晨正念挑战',
  desc: '每天早晨 10 分钟正念练习并打卡，满 21 天获「晨光践行者」勋章 + 100 积分',
  done: 12,
  total: 21,
  participants: 63,
}

export interface LeaderboardRow {
  rank: number
  name: string
  avatar: string
  level: number
  points: number
  isMe: boolean
}

/** 排行榜（demo 数据） */
export const LEADERBOARD: LeaderboardRow[] = [
  { rank: 1, name: '陈璐', avatar: 'https://randomuser.me/api/portraits/women/68.jpg', level: 3, points: 2860, isMe: false },
  { rank: 2, name: '王小满', avatar: 'https://randomuser.me/api/portraits/women/21.jpg', level: 3, points: 2410, isMe: false },
  { rank: 3, name: '阿哲', avatar: 'https://randomuser.me/api/portraits/men/22.jpg', level: 2, points: 1980, isMe: false },
  { rank: 4, name: '林小溪', avatar: 'https://randomuser.me/api/portraits/women/29.jpg', level: 2, points: 1720, isMe: false },
  { rank: 5, name: '周雅琪', avatar: 'https://randomuser.me/api/portraits/women/90.jpg', level: 2, points: 1450, isMe: false },
  { rank: 6, name: '我', avatar: 'https://randomuser.me/api/portraits/women/12.jpg', level: 1, points: 1210, isMe: true },
  { rank: 7, name: '大圣', avatar: 'https://randomuser.me/api/portraits/men/45.jpg', level: 1, points: 980, isMe: false },
]

/** 导师工作台演示数据（demo） */
export const WORKSPACE_STATS = {
  memberCount: 326,
  memberGrowthWeek: 18,
  activeToday: 31,
  monthRevenue: 6498600, // 分
  pendingPosts: 2,
  upcomingEvents: 1,
  seedCustomers: { month: 3, total: 11, target: 3 },
  inviteJoined: 47,
  topMembers: LEADERBOARD.slice(0, 3),
  recentMembers: [
    { name: '小杨', avatar: 'https://randomuser.me/api/portraits/women/33.jpg', time: '今天 14:02' },
    { name: 'Cindy', avatar: 'https://randomuser.me/api/portraits/women/57.jpg', time: '今天 09:47' },
    { name: '老白', avatar: 'https://randomuser.me/api/portraits/men/60.jpg', time: '昨天 21:30' },
  ],
}
