<template>
  <view class="page">
    <view class="status-bar-placeholder" :style="{ height: statusBarHeight + 'px' }"></view>

    <!-- 16:9 封面（主理人自定义上传） -->
    <view class="hero">
      <image v-if="community.cover && !coverErr" class="hero-img" :src="community.cover" mode="aspectFill" @error="coverErr = true" />
      <view v-else class="hero-fallback" :style="{ background: community.coverFallback }"></view>
      <view class="hero-nav">
        <view class="back-btn" @tap="goBack"><text>←</text></view>
        <text v-if="managed" class="manage-btn" @tap="goWorkspace">管理工作台 ›</text>
      </view>
    </view>

    <!-- 封面下方信息区 -->
    <view class="info-card">
      <view class="info-title-row">
        <text class="info-name serif">{{ community.name }}</text>
        <text v-if="community.isOfficial" class="badge official">官方</text>
      </view>
      <text class="info-slogan">{{ community.slogan }}</text>
      <view class="info-meta">
        <text>{{ community.memberCount }} 成员</text>
        <text class="dot">·</text>
        <text>今日活跃 {{ community.activeToday }}</text>
        <text class="dot">·</text>
        <text class="fee" :class="{ free: community.yearlyFee === 0 }">
          {{ community.yearlyFee === 0 ? '免费加入' : `¥${(community.yearlyFee / 100).toFixed(0)}/年` }}
        </text>
      </view>
      <view class="info-tags">
        <text v-for="tag in community.tags" :key="tag" class="tag">{{ tag }}</text>
      </view>
      <view class="owner-row">
        <image class="owner-avatar" :src="community.owner.avatar" mode="aspectFill" />
        <view class="owner-info">
          <text class="owner-name">{{ community.owner.name }}</text>
          <text class="owner-title">{{ community.owner.title }}</text>
        </view>
        <view class="join-btn" :class="{ joined: joined }" @tap="onJoin">
          <text>{{ joined ? '已加入' : community.yearlyFee > 0 ? '订阅加入' : '免费加入' }}</text>
        </view>
        <view class="invite-btn" @tap="onInvite"><text>邀请</text></view>
      </view>
    </view>

    <!-- Tab 栏 -->
    <view class="tab-bar">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: currentTab === tab.key }"
        @tap="currentTab = tab.key"
      >
        <text>{{ tab.label }}</text>
      </view>
    </view>

    <!-- 动态 -->
    <view v-if="currentTab === 'feed'" class="tab-content">
      <view class="compose-bar">
        <image class="compose-avatar" :src="myAvatar" mode="aspectFill" />
        <view class="compose-input" @tap="onCompose"><text class="compose-placeholder">分享你的练习心得…</text></view>
      </view>
      <view v-for="post in posts" :key="post.id" class="post-card">
        <view class="post-head">
          <image class="post-avatar" :src="post.author.avatar" mode="aspectFill" />
          <view class="post-author-info">
            <view class="post-author-row">
              <text class="post-author-name">{{ post.author.name }}</text>
              <text v-if="post.author.role === '主理人'" class="role-tag">主理人</text>
              <text class="lv-tag">LV{{ post.author.level }}</text>
            </view>
            <text class="post-time">{{ timeAgo(post.time) }}</text>
          </view>
        </view>
        <text class="post-content">{{ post.content }}</text>
        <view v-if="post.images && post.images.length" class="post-images">
          <image v-for="(img, i) in post.images" :key="i" class="post-img" :src="img" mode="aspectFill" />
        </view>
        <view class="post-actions">
          <view class="action" :class="{ liked: post.liked }" @tap="onLike(post)">
            <text>{{ post.liked ? '♥' : '♡' }} {{ post.likes }}</text>
          </view>
          <view class="action" @tap="onComment(post)">
            <text>{{ post.comments }}</text>
          </view>
        </view>
      </view>
      <view v-if="!posts.length" class="empty"><text>暂无动态，来发第一条吧</text></view>
    </view>

    <!-- 活动日历 -->
    <view v-if="currentTab === 'calendar'" class="tab-content">
      <view class="cal-head">
        <view class="cal-arrow" @tap="prevMonth"><text>‹</text></view>
        <text class="cal-title serif">{{ calYear }} 年 {{ calMonth }} 月</text>
        <view class="cal-arrow" @tap="nextMonth"><text>›</text></view>
      </view>
      <view class="cal-week">
        <text v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w" class="cal-week-item">{{ w }}</text>
      </view>
      <view class="cal-grid">
        <view
          v-for="(cell, i) in calendarCells"
          :key="i"
          class="cal-cell"
          :class="{ blank: !cell.date, selected: cell.date === selectedDate, today: cell.isToday }"
          @tap="cell.date && (selectedDate = cell.date)"
        >
          <text v-if="cell.date" class="cal-day">{{ cell.day }}</text>
          <view v-if="cell.hasEvent" class="cal-dot"></view>
        </view>
      </view>

      <view class="day-events">
        <view v-for="ev in eventsOnSelected" :key="ev.id" class="event-card">
          <view class="event-time-col">
            <text class="event-time latin">{{ ev.time }}</text>
            <text class="event-type" :class="'t-' + ev.type">{{ eventTypeName(ev.type) }}</text>
          </view>
          <view class="event-info">
            <text class="event-title">{{ ev.title }}</text>
            <text class="event-meta">{{ ev.venue ? ev.venue + ' · ' : '' }}已报名 {{ ev.joined }}{{ ev.capacity ? '/' + ev.capacity : '' }}</text>
            <text v-if="ev.courseId" class="event-course">官方课程 · 可跳转报名</text>
          </view>
          <view v-if="ev.courseId" class="event-btn course" @tap="goCourse(ev)"><text>去报名</text></view>
          <view v-else class="event-btn" :class="{ full: ev.capacity > 0 && ev.joined >= ev.capacity }" @tap="onJoinEvent(ev)">
            <text>{{ ev.capacity > 0 && ev.joined >= ev.capacity ? '已满' : '报名' }}</text>
          </view>
        </view>
        <view v-if="!eventsOnSelected.length" class="empty small"><text>这一天暂无活动</text></view>
      </view>
    </view>

    <!-- 互动：打卡 / 挑战 / 每日一题 -->
    <view v-if="currentTab === 'play'" class="tab-content">
      <view class="my-points-bar">
        <text class="my-points-label">我的积分</text>
        <text class="my-points-value latin">{{ myPoints }}</text>
        <text class="my-points-lv">LV{{ myLevel }} · {{ levelTitles[myLevel - 1] }}</text>
      </view>

      <!-- 每日打卡 -->
      <view class="play-card">
        <view class="play-head">
          <text class="play-title">每日打卡</text>
          <text class="play-sub">已连续打卡 {{ CHECKIN.streak + (checkedIn ? 1 : 0) }} 天 · 连满 {{ CHECKIN.streakBonus.days }} 天额外 +{{ CHECKIN.streakBonus.bonus }} 分</text>
        </view>
        <view class="checkin-days">
          <view v-for="d in 7" :key="d" class="checkin-day" :class="{ done: d <= CHECKIN.streak + (checkedIn ? 1 : 0), today: d === CHECKIN.streak + 1 && !checkedIn }">
            <text>{{ d <= CHECKIN.streak + (checkedIn ? 1 : 0) ? '✓' : d === CHECKIN.streak + 1 ? '今天' : d }}</text>
          </view>
        </view>
        <view class="play-btn" :class="{ disabled: checkedIn }" @tap="onCheckin">
          <text>{{ checkedIn ? '今日已打卡 +' + CHECKIN.rewardToday + ' 分' : '打卡 +' + CHECKIN.rewardToday + ' 分' }}</text>
        </view>
      </view>

      <!-- 21 天挑战 -->
      <view class="play-card">
        <view class="play-head">
          <text class="play-title">{{ CHALLENGE.title }}</text>
          <text class="play-sub">{{ CHALLENGE.desc }}</text>
        </view>
        <view class="challenge-bar"><view class="challenge-fill" :style="{ width: (CHALLENGE.done / CHALLENGE.total) * 100 + '%' }"></view></view>
        <view class="challenge-meta">
          <text>已坚持 {{ CHALLENGE.done }}/{{ CHALLENGE.total }} 天 · {{ CHALLENGE.participants }} 人同行</text>
        </view>
        <view class="play-btn ghost" @tap="onChallenge"><text>{{ challengeJoined ? '已参加 · 明天记得来打卡' : '参加挑战' }}</text></view>
      </view>

      <!-- 每日一题 -->
      <view class="play-card">
        <view class="play-head">
          <text class="play-title">每日一题</text>
          <text class="play-sub">答对 +10 分，题目每天更新</text>
        </view>
        <text class="quiz-q">{{ DAILY_QUIZ.question }}</text>
        <view
          v-for="(opt, i) in DAILY_QUIZ.options"
          :key="i"
          class="quiz-opt"
          :class="{ picked: quizPicked === i, correct: quizPicked !== null && i === DAILY_QUIZ.answer, wrong: quizPicked === i && i !== DAILY_QUIZ.answer }"
          @tap="onQuiz(i)"
        >
          <text>{{ ['A', 'B', 'C', 'D'][i] }}. {{ opt }}</text>
        </view>
        <text v-if="quizPicked !== null" class="quiz-explain">
          {{ quizPicked === DAILY_QUIZ.answer ? '答对了 +10 分！' : '再想想～正确答案已标出。' }}{{ DAILY_QUIZ.explain }}
        </text>
      </view>
    </view>

    <!-- 排行榜 -->
    <view v-if="currentTab === 'leaderboard'" class="tab-content">
      <view class="lb-header">
        <text class="lb-system-name serif">大富翁体系</text>
        <text class="lb-system-desc">积分升级解锁权益，邀请好友入会额外加分</text>
      </view>
      <view class="lb-tip">
        <text>积分来自：发帖 +10 · 评论 +5 · 点赞 +1 · 完成课时 +20 · 活动打卡 +30 · 邀请好友入会 +50</text>
      </view>
      <view class="lb-podium">
        <view v-for="row in leaderboard.slice(0, 3)" :key="row.rank" class="podium-item" :class="'rank' + row.rank">
          <image class="podium-avatar" :src="row.avatar" mode="aspectFill" />
          <text class="podium-medal">{{ ['🥇', '🥈', '🥉'][row.rank - 1] }}</text>
          <text class="podium-name">{{ row.name }}</text>
          <text class="podium-points latin">{{ row.points }} 分</text>
        </view>
      </view>
      <view v-for="row in leaderboard.slice(3)" :key="row.rank" class="lb-row" :class="{ me: row.isMe }">
        <text class="lb-rank latin">{{ row.rank }}</text>
        <image class="lb-avatar" :src="row.avatar" mode="aspectFill" />
        <view class="lb-info">
          <text class="lb-name">{{ row.name }}{{ row.isMe ? '（我）' : '' }}</text>
          <text class="lb-level">LV{{ row.level }}</text>
        </view>
        <text class="lb-points latin">{{ row.points }}</text>
      </view>

      <view class="reward-section">
        <text class="section-title serif">等级奖励</text>
        <view v-for="rw in levelRewards" :key="rw.level" class="reward-row" :class="{ reached: myPoints >= rw.pointsNeed }">
          <view class="reward-lv"><text>LV{{ rw.level }}</text></view>
          <view class="reward-info">
            <text class="reward-title">{{ rw.title }}<text class="reward-need"> · {{ rw.pointsNeed }} 分</text></text>
            <text class="reward-desc">{{ rw.reward }}</text>
          </view>
          <text class="reward-state">{{ myPoints >= rw.pointsNeed ? '已解锁' : '未解锁' }}</text>
        </view>
      </view>

      <view class="reward-section">
        <text class="section-title serif">积分能用来做什么</text>
        <view v-for="use in pointsUses" :key="use.title" class="use-row">
          <text class="use-icon">{{ use.icon }}</text>
          <view class="use-info">
            <text class="use-title">{{ use.title }}</text>
            <text class="use-desc">{{ use.desc }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 成员 -->
    <view v-if="currentTab === 'members'" class="tab-content">
      <view v-for="m in members" :key="m.id" class="member-card">
        <image class="member-avatar" :src="m.avatar" mode="aspectFill" />
        <view class="member-info">
          <text class="member-name">{{ m.name }}</text>
        </view>
        <text class="member-joined">{{ fmtJoin(m.joinedAt) }} 加入</text>
      </view>
      <view v-if="!members.length" class="empty"><text>还没有成员，邀请朋友加入吧</text></view>
    </view>

    <!-- 发帖 Bottom Sheet -->
    <view v-if="composeVisible" class="popup-mask" @tap="composeVisible = false">
      <view class="popup-content" @tap.stop>
        <view class="popup-handle"></view>
        <text class="popup-title serif">发布动态</text>
        <textarea class="compose-textarea" v-model="composeText" placeholder="分享你的练习心得…" maxlength="500" />
        <view class="popup-btn" :class="{ disabled: !composeText.trim() }" @tap="onSubmitPost"><text>发布</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  fetchCommunity, fetchMembership, fetchPosts, fetchEvents, fetchMembers,
  joinCommunity, leaveCommunity, submitPost,
  LEVEL_REWARDS, POINTS_USES, DAILY_QUIZ, CHECKIN, CHALLENGE, LEADERBOARD,
  type Community, type CommunityPost, type CommunityEvent, type CommunityMember,
} from '@/api/skool'

const statusBarHeight = ref(44)
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 44
} catch (e) { /* fallback */ }

const communityId = ref('')
const community = ref<Community>({
  id: '', name: '', slogan: '', category: '',
  cover: '', coverFallback: 'linear-gradient(135deg, #6D5934 0%, #A78E70 100%)',
  owner: { name: '', title: '', avatar: '' }, memberCount: 0, yearlyFee: 0,
  isOfficial: false, tags: [], description: '', activeToday: 0,
})
const coverErr = ref(false)
const joined = ref(false)
const managed = ref(false)
const posts = ref<CommunityPost[]>([])
const events = ref<CommunityEvent[]>([])
const members = ref<CommunityMember[]>([])
const leaderboard = LEADERBOARD
const levelRewards = LEVEL_REWARDS
const pointsUses = POINTS_USES
const levelTitles = LEVEL_REWARDS.map((r) => r.title)

const tabs = [
  { key: 'feed', label: '动态' },
  { key: 'calendar', label: '活动' },
  { key: 'play', label: '互动' },
  { key: 'leaderboard', label: '排行榜' },
  { key: 'members', label: '成员' },
] as const
const currentTab = ref<(typeof tabs)[number]['key']>('feed')

const myLevel = 1
const myPoints = ref(1210)
const myAvatar = 'https://randomuser.me/api/portraits/women/12.jpg'

onLoad(async (options) => {
  const id = options?.id || ''
  if (!id) return
  communityId.value = id
  await loadAll(id)
})

async function loadAll(id: string) {
  try {
    const c = await fetchCommunity(id)
    community.value = c
    coverErr.value = false
  } catch (e) { /* silent */ }
  // 登录态下补充：是否已加入/是否主理人
  if (uni.getStorageSync('token')) {
    try {
      const m = await fetchMembership(id)
      joined.value = m.joined
      managed.value = m.managed
    } catch (e) { /* silent */ }
  }
  try { posts.value = await fetchPosts(id) } catch (e) { /* silent */ }
  try {
    events.value = await fetchEvents(id)
    initCalendar()
  } catch (e) { /* silent */ }
  try { members.value = await fetchMembers(id) } catch (e) { /* silent */ }
}

// ===== 活动日历 =====
const now = new Date()
const calYear = ref(now.getFullYear())
const calMonth = ref(now.getMonth() + 1)
const selectedDate = ref(fmtDateStr(now))

function fmtDateStr(d: Date) {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
}

/** 初始化日历：默认选中「本月第一个有活动的日子」，没有则选今天 */
function initCalendar() {
  const prefix = `${calYear.value}-${`${calMonth.value}`.padStart(2, '0')}`
  const monthEvents = events.value.filter((e) => e.date.startsWith(prefix))
  selectedDate.value = monthEvents.length ? monthEvents[0].date : fmtDateStr(new Date())
}

function prevMonth() {
  if (calMonth.value === 1) { calMonth.value = 12; calYear.value -= 1 } else calMonth.value -= 1
  initCalendar()
}
function nextMonth() {
  if (calMonth.value === 12) { calMonth.value = 1; calYear.value += 1 } else calMonth.value += 1
  initCalendar()
}

const calendarCells = computed(() => {
  const y = calYear.value
  const m = calMonth.value
  const firstOffset = (new Date(y, m - 1, 1).getDay() + 6) % 7 // 周一开头
  const days = new Date(y, m, 0).getDate()
  const todayStr = fmtDateStr(new Date())
  const eventDates = new Set(events.value.map((e) => e.date))
  const cells: { date: string; day: number; hasEvent: boolean; isToday: boolean }[] = []
  for (let i = 0; i < firstOffset; i++) cells.push({ date: '', day: 0, hasEvent: false, isToday: false })
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${`${m}`.padStart(2, '0')}-${`${d}`.padStart(2, '0')}`
    cells.push({ date: ds, day: d, hasEvent: eventDates.has(ds), isToday: ds === todayStr })
  }
  return cells
})

const eventsOnSelected = computed(() =>
  events.value.filter((e) => e.date === selectedDate.value).sort((a, b) => a.time.localeCompare(b.time)),
)

function eventTypeName(t: string) {
  return t === 'OFFLINE' ? '线下' : t === 'LIVE' ? '直播' : '线上'
}

function goCourse(ev: CommunityEvent) {
  uni.navigateTo({ url: `/pages/course-detail/index?id=${ev.courseId}` })
}

function onJoinEvent(ev: CommunityEvent) {
  if (ev.capacity > 0 && ev.joined >= ev.capacity) return
  if (!joined.value) {
    uni.showToast({ title: '请先加入社群', icon: 'none' })
    return
  }
  ev.joined += 1
  uni.showToast({ title: '报名成功', icon: 'none' })
}

// ===== 动态 =====
const composeVisible = ref(false)
const composeText = ref('')

function onCompose() {
  if (!uni.getStorageSync('token')) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  composeVisible.value = true
}

async function onSubmitPost() {
  const content = composeText.value.trim()
  if (!content) return
  try {
    await submitPost(communityId.value, content)
    composeVisible.value = false
    composeText.value = ''
    uni.showToast({ title: '已提交，审核通过后展示', icon: 'none' })
  } catch (e) { /* 拦截器已提示 */ }
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 60) return `${Math.max(min, 1)} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} 天前`
  return iso.slice(0, 10)
}

function onLike(post: CommunityPost) {
  post.liked = !post.liked
  post.likes += post.liked ? 1 : -1
}

function onComment(_post: CommunityPost) {
  uni.showToast({ title: '评论功能即将上线', icon: 'none' })
}

// ===== 加入 / 邀请 =====
async function onJoin() {
  try {
    if (joined.value) {
      await leaveCommunity(communityId.value)
      joined.value = false
      community.value.memberCount = Math.max((community.value.memberCount || 1) - 1, 0)
      uni.showToast({ title: '已退出社群', icon: 'none' })
    } else {
      await joinCommunity(communityId.value)
      joined.value = true
      community.value.memberCount = (community.value.memberCount || 0) + 1
      uni.showToast({ title: '已加入社群', icon: 'none' })
    }
  } catch (e) { /* 拦截器已提示 */ }
}

function onInvite() {
  uni.showModal({
    title: '邀请朋友加入',
    content: `将生成「${community.value.name}」专属邀请卡，分享给微信好友或朋友圈。`,
    confirmText: '生成邀请卡',
    success: (res) => {
      if (res.confirm) uni.showToast({ title: '邀请卡即将上线', icon: 'none' })
    },
  })
}

function fmtJoin(iso: string) {
  return (iso || '').slice(5, 10)
}

// ===== 互动玩法 =====
const checkedIn = ref(false)
const challengeJoined = ref(false)
const quizPicked = ref<number | null>(null)

function onCheckin() {
  if (checkedIn.value) return
  checkedIn.value = true
  myPoints.value += CHECKIN.rewardToday
  uni.showToast({ title: `打卡成功 +${CHECKIN.rewardToday} 分`, icon: 'none' })
}

function onChallenge() {
  challengeJoined.value = true
  uni.showToast({ title: '已加入挑战，明早见', icon: 'none' })
}

function onQuiz(i: number) {
  if (quizPicked.value !== null) return
  quizPicked.value = i
  if (i === DAILY_QUIZ.answer) {
    myPoints.value += 10
    uni.showToast({ title: '答对了 +10 分', icon: 'none' })
  }
}

function goBack() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) })
}

function goWorkspace() {
  uni.navigateTo({ url: `/pages/community-workspace/index?id=${communityId.value}` })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.status-bar-placeholder { width: 100%; }

/* 16:9 封面大图 */
.hero { position: relative; width: 100%; }
.hero-img, .hero-fallback { display: block; width: 100%; height: 210px; }
.hero-nav { position: absolute; top: 8px; left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: center; }
.back-btn { width: 32px; height: 32px; border-radius: 16px; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; }
.back-btn text { color: #fff; font-size: 18px; }
.manage-btn { padding: 6px 12px; border-radius: 14px; background: rgba(0,0,0,0.35); color: #fff; font-size: 12px; }

/* 封面下方信息卡 */
.info-card { background: #FBF8F3; margin: -18px 12px 0; border-radius: 22px; padding: 16px; position: relative; box-shadow: 0 2px 10px rgba(88,66,25,0.08); }
.info-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.info-name { font-size: 20px; font-weight: 600; color: #3F2F10; letter-spacing: 1px; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; }
.badge.official { background: rgba(201,163,92,0.18); color: #8C7335; }
.info-slogan { display: block; margin-top: 6px; font-size: 13px; color: #6D5934; }
.info-meta { margin-top: 10px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.info-meta text { font-size: 12px; color: #6D5934; }
.info-meta .dot { color: #A78E70; }
.info-meta .fee { color: #B06A3F; font-weight: 600; }
.info-meta .fee.free { color: #584219; }
.info-tags { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.tag { padding: 3px 10px; border-radius: 10px; background: #EAE0D7; font-size: 11px; color: #6D5934; }
.owner-row { margin-top: 14px; display: flex; align-items: center; background: #F4EEE6; border-radius: 16px; padding: 10px 12px; }
.owner-avatar { width: 40px; height: 40px; border-radius: 20px; margin-right: 10px; background: #F4EEE6; }
.owner-info { flex: 1; display: flex; flex-direction: column; }
.owner-name { color: #3F2F10; font-size: 14px; font-weight: 600; }
.owner-title { color: #A78E70; font-size: 11px; margin-top: 2px; }
.join-btn { padding: 8px 16px; border-radius: 999rpx; background: #584219; }
.join-btn text { font-size: 13px; font-weight: 600; color: #fff; }
.join-btn.joined { background: #EAE0D7; }
.join-btn.joined text { color: #6D5934; }
.invite-btn { margin-left: 8px; padding: 8px 14px; border-radius: 999rpx; border: 1px solid #A78E70; }
.invite-btn text { font-size: 13px; color: #584219; }

.tab-bar { display: flex; background: #FBF8F3; margin-top: 12px; padding: 0 4px; border-bottom: 1px solid rgba(88,66,25,0.08); position: sticky; top: 0; z-index: 10; }
.tab-item { flex: 1; text-align: center; padding: 12px 0; position: relative; }
.tab-item text { font-size: 13px; color: #A78E70; }
.tab-item.active text { color: #584219; font-weight: 600; }
.tab-item.active::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 24px; height: 3px; border-radius: 2px; background: #584219; }

.tab-content { padding: 16px 16px 40px; }

/* 动态 */
.compose-bar { display: flex; align-items: center; background: #FBF8F3; border-radius: 22px; padding: 12px; margin-bottom: 12px; }
.compose-avatar { width: 36px; height: 36px; border-radius: 18px; margin-right: 10px; background: #F4EEE6; }
.compose-input { flex: 1; background: #EAE0D7; border-radius: 16px; padding: 8px 14px; }
.compose-placeholder { font-size: 13px; color: #A78E70; }
.post-card { background: #FBF8F3; border-radius: 22px; padding: 14px; margin-bottom: 12px; }
.post-head { display: flex; align-items: center; }
.post-avatar { width: 36px; height: 36px; border-radius: 18px; margin-right: 10px; background: #F4EEE6; }
.post-author-info { flex: 1; }
.post-author-row { display: flex; align-items: center; gap: 6px; }
.post-author-name { font-size: 14px; font-weight: 600; color: #3F2F10; }
.role-tag { padding: 1px 6px; border-radius: 8px; background: rgba(211,149,110,0.16); font-size: 10px; color: #B06A3F; }
.lv-tag { padding: 1px 6px; border-radius: 8px; background: #EAE0D7; font-size: 10px; color: #6D5934; }
.post-time { font-size: 11px; color: #A78E70; }
.post-content { display: block; margin-top: 10px; font-size: 14px; line-height: 1.8; color: #3F2F10; }
.post-images { margin-top: 10px; display: flex; gap: 6px; }
.post-img { width: 180px; height: 120px; border-radius: 10px; background: #EAE0D7; }
.post-actions { margin-top: 12px; display: flex; gap: 24px; }
.action text { font-size: 13px; color: #A78E70; }
.action.liked text { color: #B06A3F; }

/* 活动日历 */
.cal-head { display: flex; align-items: center; justify-content: space-between; background: #FBF8F3; border-radius: 22px; padding: 12px 16px; margin-bottom: 12px; }
.cal-title { font-size: 16px; font-weight: 600; color: #3F2F10; letter-spacing: 1px; }
.cal-arrow { width: 30px; height: 30px; border-radius: 15px; background: #F4EEE6; display: flex; align-items: center; justify-content: center; }
.cal-arrow text { font-size: 18px; color: #584219; }
.cal-week { display: flex; padding: 0 4px 6px; }
.cal-week-item { flex: 1; text-align: center; font-size: 11px; color: #A78E70; }
.cal-grid { display: flex; flex-wrap: wrap; background: #FBF8F3; border-radius: 22px; padding: 8px 4px 12px; margin-bottom: 12px; }
.cal-cell { position: relative; width: calc(100% / 7); height: 44px; display: flex; align-items: center; justify-content: center; }
.cal-cell.blank { visibility: hidden; }
.cal-day { font-size: 13px; color: #6D5934; width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 16px; }
.cal-cell.today .cal-day { border: 1px dashed #A78E70; }
.cal-cell.selected .cal-day { background: #584219; color: #fff; font-weight: 600; }
.cal-dot { position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); width: 5px; height: 5px; border-radius: 3px; background: #D3956E; }
.cal-cell.selected .cal-dot { background: #F4EEE6; }

.day-events { margin-top: 4px; }
.event-card { display: flex; align-items: center; background: #FBF8F3; border-radius: 22px; padding: 14px; margin-bottom: 12px; }
.event-time-col { width: 56px; display: flex; flex-direction: column; align-items: center; margin-right: 12px; }
.event-time { font-size: 18px; font-weight: 600; color: #3F2F10; }
.event-type { margin-top: 4px; padding: 1px 8px; border-radius: 8px; font-size: 10px; }
.event-type.t-OFFLINE { background: rgba(211,149,110,0.16); color: #B06A3F; }
.event-type.t-LIVE { background: rgba(88,66,25,0.08); color: #584219; }
.event-type.t-ONLINE { background: rgba(167,142,112,0.14); color: #8C7335; }
.event-info { flex: 1; }
.event-title { display: block; font-size: 14px; font-weight: 600; color: #3F2F10; }
.event-meta { display: block; margin-top: 4px; font-size: 12px; color: #A78E70; }
.event-course { display: block; margin-top: 4px; font-size: 11px; color: #8C7335; }
.event-btn { padding: 8px 14px; border-radius: 999rpx; background: #584219; }
.event-btn text { color: #fff; font-size: 13px; }
.event-btn.full { background: #F4EEE6; }
.event-btn.full text { color: #A78E70; }
.event-btn.course { background: rgba(201,163,92,0.25); }
.event-btn.course text { color: #8C7335; font-weight: 600; }

/* 互动 */
.my-points-bar { display: flex; align-items: baseline; gap: 8px; background: linear-gradient(135deg, #584219, #6D5934); border-radius: 22px; padding: 14px 16px; margin-bottom: 12px; }
.my-points-label { font-size: 13px; color: rgba(255,255,255,0.8); }
.my-points-value { font-size: 26px; font-weight: 700; color: #F4EEE6; }
.my-points-lv { margin-left: auto; font-size: 12px; color: rgba(255,255,255,0.85); }
.play-card { background: #FBF8F3; border-radius: 22px; padding: 14px; margin-bottom: 12px; }
.play-head { margin-bottom: 12px; }
.play-title { display: block; font-size: 15px; font-weight: 600; color: #3F2F10; }
.play-sub { display: block; margin-top: 4px; font-size: 12px; color: #A78E70; line-height: 1.5; }
.checkin-days { display: flex; gap: 6px; margin-bottom: 12px; }
.checkin-day { flex: 1; height: 34px; border-radius: 8px; background: #EAE0D7; display: flex; align-items: center; justify-content: center; }
.checkin-day text { font-size: 11px; color: #A78E70; }
.checkin-day.done { background: rgba(88,66,25,0.08); }
.checkin-day.done text { color: #584219; font-weight: 600; }
.checkin-day.today { border: 1px dashed #B06A3F; background: #F4EEE6; }
.checkin-day.today text { color: #B06A3F; }
.play-btn { background: #584219; border-radius: 999rpx; padding: 10px; text-align: center; }
.play-btn text { color: #fff; font-size: 14px; font-weight: 600; }
.play-btn.disabled { background: #F4EEE6; }
.play-btn.disabled text { color: #A78E70; }
.play-btn.ghost { background: #F4EEE6; }
.play-btn.ghost text { color: #8C7335; }

.challenge-bar { height: 8px; border-radius: 4px; background: #EAE0D7; overflow: hidden; }
.challenge-fill { height: 100%; background: linear-gradient(90deg, #B06A3F, #C9A35C); border-radius: 4px; }
.challenge-meta { margin: 8px 0 12px; }
.challenge-meta text { font-size: 12px; color: #6D5934; }

.quiz-q { display: block; font-size: 14px; font-weight: 500; color: #3F2F10; margin-bottom: 10px; line-height: 1.5; }
.quiz-opt { background: #F4EEE6; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; border: 1px solid transparent; }
.quiz-opt text { font-size: 13px; color: #3F2F10; }
.quiz-opt.correct { background: rgba(88,66,25,0.08); border-color: #584219; }
.quiz-opt.correct text { color: #584219; font-weight: 600; }
.quiz-opt.wrong { background: rgba(211,149,110,0.16); border-color: #B06A3F; }
.quiz-opt.wrong text { color: #B06A3F; }
.quiz-explain { display: block; margin-top: 4px; font-size: 12px; color: #6D5934; line-height: 1.5; }

/* 排行榜 */
.lb-header { margin-bottom: 10px; }
.lb-system-name { display: block; font-size: 16px; font-weight: 600; color: #3F2F10; letter-spacing: 1px; }
.lb-system-desc { display: block; margin-top: 4px; font-size: 12px; color: #A78E70; }
.lb-tip { background: #F4EEE6; border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.lb-tip text { font-size: 11px; color: #8C7335; line-height: 1.5; }
.lb-podium { display: flex; align-items: flex-end; justify-content: center; background: #FBF8F3; border-radius: 22px; padding: 20px 12px 16px; margin-bottom: 12px; }
.podium-item { display: flex; flex-direction: column; align-items: center; width: 33%; }
.podium-item.rank1 { order: 2; }
.podium-item.rank2 { order: 1; }
.podium-item.rank3 { order: 3; }
.podium-avatar { width: 48px; height: 48px; border-radius: 24px; background: #F4EEE6; }
.podium-item.rank1 .podium-avatar { width: 60px; height: 60px; border-radius: 30px; }
.podium-medal { margin-top: 6px; font-size: 16px; }
.podium-name { margin-top: 4px; font-size: 13px; font-weight: 600; color: #3F2F10; }
.podium-points { font-size: 11px; color: #A78E70; }
.lb-row { display: flex; align-items: center; background: #FBF8F3; border-radius: 22px; padding: 12px 14px; margin-bottom: 8px; }
.lb-row.me { background: #F4EEE6; border: 1px solid #EAD9B8; }
.lb-rank { width: 24px; font-size: 14px; font-weight: 600; color: #A78E70; }
.lb-avatar { width: 36px; height: 36px; border-radius: 18px; margin-right: 10px; background: #F4EEE6; }
.lb-info { flex: 1; display: flex; align-items: center; gap: 6px; }
.lb-name { font-size: 14px; color: #3F2F10; font-weight: 500; }
.lb-level { font-size: 11px; color: #6D5934; }
.lb-points { font-size: 14px; font-weight: 600; color: #584219; }
.reward-section { margin-top: 20px; }
.section-title { display: block; font-size: 15px; font-weight: 600; color: #3F2F10; margin-bottom: 10px; letter-spacing: 1px; }
.reward-row { display: flex; align-items: center; background: #FBF8F3; border-radius: 22px; padding: 12px 14px; margin-bottom: 8px; }
.reward-row.reached { border: 1px solid #A78E70; }
.reward-lv { width: 40px; height: 40px; border-radius: 20px; background: #EAE0D7; display: flex; align-items: center; justify-content: center; margin-right: 10px; }
.reward-row.reached .reward-lv { background: #584219; }
.reward-lv text { font-size: 12px; font-weight: 600; color: #6D5934; }
.reward-row.reached .reward-lv text { color: #fff; }
.reward-info { flex: 1; }
.reward-title { display: block; font-size: 13px; font-weight: 600; color: #3F2F10; }
.reward-need { font-size: 11px; color: #A78E70; font-weight: 400; }
.reward-desc { display: block; margin-top: 2px; font-size: 12px; color: #6D5934; }
.reward-state { font-size: 12px; color: #A78E70; }
.reward-row.reached .reward-state { color: #584219; }
.use-row { display: flex; align-items: flex-start; background: #FBF8F3; border-radius: 22px; padding: 12px 14px; margin-bottom: 8px; }
.use-icon { font-size: 20px; margin-right: 10px; }
.use-info { flex: 1; }
.use-title { display: block; font-size: 13px; font-weight: 600; color: #3F2F10; }
.use-desc { display: block; margin-top: 2px; font-size: 12px; color: #6D5934; line-height: 1.5; }

/* 成员 */
.member-card { display: flex; align-items: center; background: #FBF8F3; border-radius: 22px; padding: 12px 14px; margin-bottom: 8px; }
.member-avatar { width: 40px; height: 40px; border-radius: 20px; margin-right: 10px; background: #F4EEE6; }
.member-info { flex: 1; }
.member-name { font-size: 14px; font-weight: 600; color: #3F2F10; }
.member-joined { font-size: 11px; color: #A78E70; }

/* 发帖 Bottom Sheet */
.popup-mask { position: fixed; inset: 0; background: rgba(63,47,16,0.4); z-index: 100; display: flex; align-items: flex-end; }
.popup-content { width: 100%; background: #F4EEE6; border-radius: 52rpx 52rpx 0 0; padding: 24px 20px calc(20px + env(safe-area-inset-bottom)); animation: sheet-up 0.3s ease; }
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.popup-handle { width: 72rpx; height: 8rpx; border-radius: 999rpx; background: rgba(88,66,25,0.14); margin: 0 auto 20px; }
.popup-title { display: block; font-size: 16px; font-weight: 600; color: #3F2F10; margin-bottom: 12px; letter-spacing: 1px; }
.compose-textarea { width: 100%; box-sizing: border-box; height: 120px; background: #FBF8F3; border-radius: 12px; padding: 12px; font-size: 14px; color: #3F2F10; }
.popup-btn { margin-top: 14px; background: #584219; border-radius: 999rpx; padding: 12px; text-align: center; }
.popup-btn text { color: #fff; font-size: 15px; font-weight: 600; }
.popup-btn.disabled { opacity: 0.5; }

.empty { padding: 60px 0; text-align: center; color: #A78E70; font-size: 14px; }
.empty.small { padding: 24px 0; }
</style>
