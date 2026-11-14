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

import { get, post, put, del } from '@/utils/request'

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
  /** 主理人 userId，用于主理人主页分享与成员名片 */
  ownerUserId?: string
  memberCount: number
  /** 年费（分），0 = 免费 */
  yearlyFee: number
  isOfficial: boolean
  tags: string[]
  description: string
  /** 今日活跃成员数 */
  activeToday: number
  /** 平台审核状态，仅主理人工作台可见 */
  status?: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt?: string
  /** PUBLIC=公开；HIDDEN=隐藏；INVITE_ONLY=仅受邀可见 */
  visibility?: 'PUBLIC' | 'HIDDEN' | 'INVITE_ONLY'
  /** OPEN=直接加入；APPROVAL=入群审核；INVITE=仅限邀请 */
  joinMode?: 'OPEN' | 'APPROVAL' | 'INVITE'
  /** 兴趣池（最多 12 个），成员自选最多 3 个 */
  interestPool?: string[]
  /** 邀请制且未加入时为 true：服务端只返回身份信息 */
  restricted?: boolean
}

export interface CommunityEvent {
  id: string
  communityId?: string
  /** YYYY-MM-DD */
  date: string
  fullDate: string
  /** HH:mm */
  time: string
  /** 结束时间 HH:mm，用于同日活动的结束判断 */
  endTime?: string
  title: string
  /** OFFLINE=线下课程/活动，LIVE=直播，ONLINE=线上 */
  type: 'OFFLINE' | 'LIVE' | 'ONLINE'
  venue: string
  joined: number
  capacity: number
  /** 关联官方课程：存在时 C 端点击直接跳课程页报名 */
  courseId: string
  /** PUBLIC=公开；INTERNAL=仅社群成员可见 */
  scope?: 'PUBLIC' | 'INTERNAL'
  isActive?: boolean
  description?: string
  /** 服务端按实际结束时刻判断 */
  ended?: boolean
  /** 当前用户是否已报名 */
  signed?: boolean
  cover?: string
}

export interface CommunityComment {
  id: string
  author: { id?: string; name: string; avatar: string }
  content: string
  time: string
}

export interface CommunityPost {
  id: string
  author: { id?: string; name: string; role: '主理人' | '成员'; avatar: string; level: number }
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
  /** 成员自选兴趣（用于共同兴趣筛选） */
  interests?: string[]
}

export interface MemberCard {
  id: string
  name: string
  avatar: string
  joinedAt: string
  /** NONE=不展示活动；COMPLETED=只展示已完成；ALL=展示全部 */
  privacy: 'NONE' | 'COMPLETED' | 'ALL'
  interests: string[]
  activities: { id: string; title: string; date: string; time: string; ended: boolean }[]
}

/** 主理人资料（公开；不含手机号等联系方式） */
export interface HostCard {
  userId: string
  name: string
  title: string
  avatar: string
  hostRole: 'BASIC' | 'EXTENDED'
  /** 本社群创建时间，作为「主理自」展示 */
  hostSince: string
  communityCount: number
  eventCount: number
  communities: {
    id: string
    name: string
    slogan: string
    category: string
    memberCount: number
    cover: string
    current: boolean
  }[]
}

/** 我与社群的关系（V2） */
export interface CommunityMembership {
  joined: boolean
  managed: boolean
  hostRole?: string
  yearlyFee: number
  paidUntil: string | null
  expired: boolean
  joinMode: 'OPEN' | 'APPROVAL' | 'INVITE'
  visibility: 'PUBLIC' | 'HIDDEN' | 'INVITE_ONLY'
  restricted: boolean
  requestStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  requestNote: string
  privacy: 'NONE' | 'COMPLETED' | 'ALL'
  interests: string[]
  inviteAccess: boolean
  claimedInvite: { claimId: string; inviteId: string; name: string; kind: 'NORMAL' | 'WAIVER' | 'REDUCE'; amount: number } | null
}

export interface CommunityInvitePublic {
  id: string
  name: string
  kind: 'NORMAL' | 'WAIVER' | 'REDUCE'
  amount: number
  expiresAt: string | null
  quota: number
  claimedCount: number
  available: boolean
  reason: string
  community: {
    id: string
    name: string
    slogan: string
    cover: string
    coverFallback: string
    ownerName: string
    joinMode: 'OPEN' | 'APPROVAL' | 'INVITE'
    visibility: 'PUBLIC' | 'HIDDEN' | 'INVITE_ONLY'
  }
}

export type ShareType = 'course' | 'community' | 'event' | 'host' | 'invite' | 'voucher'

export interface SharePayload {
  type: ShareType
  id: string
  available: boolean
  state: 'normal' | 'ended' | 'restricted' | 'unavailable'
  reason?: string
  title: string
  subtitle: string
  description?: string
  path: string
  scene: string
  imageUrl: string
  qrUrl: string
  artwork: {
    source: 'custom' | 'cover' | 'brand'
    palette: 'warm' | 'sage' | 'ink'
    layout: 'left' | 'center'
    imageUrl?: string
  }
}

export interface ShareResolveResult {
  available: boolean
  state: 'normal' | 'ended' | 'restricted' | 'unavailable'
  reason: string
  type?: ShareType
  id?: string
  title?: string
  subtitle?: string
  path?: string
  imageUrl?: string
}

/** 《Full愈 社群代结算服务协议》版本号；必须与后端 SETTLEMENT_AGREEMENT_VERSION 保持一致 */
export const SETTLEMENT_AGREEMENT_VERSION = 'v1.0-2026-10-29'
/** 平台服务费比例（订阅制社群年费），与协议文本保持一致 */
export const SETTLEMENT_SERVICE_FEE_RATE = 0.1

export type CommunitySort = 'recommend' | 'newest' | 'hot'

// ==================== 查询接口 ====================

/** 社群广场（仅公开上架社群；排序由服务端处理） */
export function fetchCommunities(category = '全部', keyword = '', sort: CommunitySort = 'recommend') {
  return get<Community[]>('/communities', { category, keyword, sort }, { auth: false, silent: true })
}

/** 社群详情 */
export function fetchCommunity(id: string) {
  return get<Community>(`/communities/${id}`, undefined, { auth: false, silent: true })
}

/** 主理人视角详情（待审核社群也可查看，需登录） */
export function fetchManagedCommunity(id: string) {
  return get<Community & { status?: string; isActive?: boolean }>(`/communities/${id}/managed`, undefined, { silent: true })
}

/** 我与社群的关系（需登录，静默） */
export function fetchMembership(id: string) {
  return get<CommunityMembership>(`/communities/${id}/membership`, undefined, { silent: true })
}

/** 活动日历数据（带登录态时可见内部活动与本人报名状态） */
export function fetchEvents(id: string) {
  return get<CommunityEvent[]>(`/communities/${id}/events`, undefined, { auth: false, silent: true })
}

/** 活动详情 */
export function fetchEvent(communityId: string, eventId: string) {
  return get<CommunityEvent & { community: { id: string; name: string; cover: string; ownerName: string } }>(
    `/communities/${communityId}/events/${eventId}`,
    undefined,
    { auth: false, silent: true },
  )
}

/** 社群活动报名 */
export function signupEvent(communityId: string, eventId: string) {
  return post<{ signed: boolean }>(`/communities/${communityId}/events/${eventId}/signup`)
}

export function cancelEventSignup(communityId: string, eventId: string) {
  return del<{ signed: boolean }>(`/communities/${communityId}/events/${eventId}/signup`)
}

/** 社群动态（成员专属） */
export function fetchPosts(id: string) {
  return get<(CommunityPost & { commentsList?: CommunityComment[] })[]>(`/communities/${id}/posts`, undefined, { silent: true })
}

/** 社群成员（成员专属） */
export function fetchMembers(id: string) {
  return get<CommunityMember[]>(`/communities/${id}/members`, undefined, { silent: true })
}

/** 成员名片（按对方隐私设置展示活动） */
export function fetchMemberCard(communityId: string, userId: string) {
  return get<MemberCard>(`/communities/${communityId}/members/${userId}/card`, undefined, { silent: true })
}

/** 主理人资料（公开，不含联系方式） */
export function fetchHostCard(communityId: string) {
  return get<HostCard>(`/communities/${communityId}/host`, undefined, { auth: false, silent: true })
}

/** 我的社群：{ managed, joined } */
export function fetchMine() {
  return get<{ managed: Community[]; joined: Community[]; hostRole?: string }>('/communities/mine', undefined, { silent: true })
}

// ==================== 分享与扫码 ====================

/** 分享目标描述：卡片与海报共用 */
export function fetchShareTarget(type: ShareType, id: string) {
  return get<SharePayload>('/share/target', { type, id }, { auth: false, silent: true })
}

/** 扫码 scene 落地解析 */
export function resolveShareScene(scene: string) {
  return get<ShareResolveResult>('/share/resolve', { scene }, { auth: false, silent: true })
}

/** 邀请落地信息（公开） */
export function fetchInvite(inviteId: string) {
  return get<CommunityInvitePublic>(`/communities/invites/${inviteId}`, undefined, { auth: false, silent: true })
}

/** 领取邀请（每人一次；不替代入群审核） */
export function claimInvite(inviteId: string) {
  return post<{
    claimed: boolean
    alreadyClaimed?: boolean
    claimId?: string
    communityId?: string
    kind?: string
    amount?: number
    requiresApproval?: boolean
  }>(`/communities/invites/${inviteId}/claim`)
}

// ==================== 用户操作 ====================

export interface CommunityJoinResult {
  joined: boolean
  requiresPayment?: boolean
  requiresApproval?: boolean
  requiresInvite?: boolean
  zeroPriceEntitlement?: boolean
  orderId?: string
  orderNo?: string
  amount?: number
  originalAmount?: number
  yearlyFee?: number
  joinMode?: string
  requestStatus?: string | null
  claimedInvite?: { claimId: string; inviteId: string; name: string; kind: string; amount: number } | null
}

/** 加入社群：直接加入 / 提交审核 / 需邀请 / 返回待支付订单 */
export function joinCommunity(id: string) {
  return post<CommunityJoinResult>(`/communities/${id}/join`)
}

export function leaveCommunity(id: string) {
  return del<{ joined: boolean }>(`/communities/${id}/join`)
}

/** 提交入群申请 */
export function applyJoin(id: string, note?: string) {
  return post<{ status: string; joined: boolean }>(`/communities/${id}/join-requests`, { note })
}

/** 我的入群申请状态 */
export function fetchMyJoinRequest(id: string) {
  return get<{ status: string; note: string | null; reviewNote: string | null; reviewedAt: string | null } | null>(
    `/communities/${id}/join-requests/mine`,
    undefined,
    { silent: true },
  )
}

/** 成员隐私与兴趣设置（每个社群独立） */
export function updatePrivacy(id: string, privacy: 'NONE' | 'COMPLETED' | 'ALL', interests: string[]) {
  return put<{ privacy: string; interests: string[] }>(`/communities/${id}/privacy`, { privacy, interests })
}

/** 我在本社群可用的邀请权益 */
export function fetchMyInviteClaim(id: string) {
  return get<{ claimId: string; inviteId: string; name: string; kind: string; amount: number } | null>(
    `/communities/${id}/invite-claims/mine`,
    undefined,
    { silent: true },
  )
}

/** 发表评论（即时可见） */
export function postComment(communityId: string, postId: string, content: string) {
  return post<CommunityComment>(`/communities/${communityId}/posts/${postId}/comments`, { content })
}

/** 点赞/取消点赞（一人一赞，返回最新计数） */
export function togglePostLike(communityId: string, postId: string) {
  return post<{ liked: boolean; likes: number }>(`/communities/${communityId}/posts/${postId}/like`)
}

/** 主理人小程序内隐藏/恢复/删除动态或评论 */
export function moderateContent(communityId: string, body: {
  targetType: 'POST' | 'COMMENT'
  targetId: string
  action: 'HIDE' | 'RESTORE' | 'DELETE'
  reason: string
}) {
  return post<{ success: boolean }>(`/communities/${communityId}/moderation`, body)
}

/** 主理人创建社群（提交平台审核） */
export function submitCommunity(body: {
  name: string
  slogan: string
  category: string
  tags: string[]
  yearlyFee: number
  description?: string
  /** 订阅制社群必须为 true：已阅读并同意《社群代结算服务协议》 */
  settlementAgreed?: boolean
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
