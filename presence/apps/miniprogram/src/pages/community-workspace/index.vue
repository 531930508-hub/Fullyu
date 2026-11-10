<template>
  <view class="page">
    <view class="status-bar-placeholder" :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="nav-bar">
      <view class="nav-back" @tap="goBack"><text>←</text></view>
      <text class="nav-title serif">{{ community?.name || '工作台' }} · 管理</text>
      <view class="nav-right" @tap="goDetail"><text>查看 ›</text></view>
    </view>

    <!-- 核心指标 -->
    <view class="stats-grid">
      <view class="stat-card">
        <text class="stat-value">{{ stats.memberCount }}</text>
        <text class="stat-label">成员总数</text>
        <text class="stat-trend up">本周 +{{ stats.memberGrowthWeek }}</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ stats.activeToday }}</text>
        <text class="stat-label">今日活跃</text>
        <text class="stat-trend">占比 {{ activeRate }}%</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">¥{{ monthRevenueYuan }}</text>
        <text class="stat-label">本月收入</text>
        <text class="stat-trend up">订阅 + 活动</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ stats.upcomingEvents }}</text>
        <text class="stat-label">近期活动</text>
        <text class="stat-trend">可在活动日历查看</text>
      </view>
    </view>

    <!-- 邀请裂变（会议核心：导师裂变自己的会员） -->
    <view class="section">
      <text class="section-title">邀请裂变</text>
      <view class="growth-card">
        <view class="growth-row">
          <view class="growth-item">
            <text class="growth-value">{{ stats.seedCustomers.month }}/{{ stats.seedCustomers.target }}</text>
            <text class="growth-label">本月种子客户</text>
          </view>
          <view class="growth-item">
            <text class="growth-value">{{ stats.seedCustomers.total }}</text>
            <text class="growth-label">累计种子客户</text>
          </view>
          <view class="growth-item">
            <text class="growth-value">{{ stats.inviteJoined }}</text>
            <text class="growth-label">邀请入会人数</text>
          </view>
        </view>
        <view class="growth-tip">
          <text>生成专属邀请卡，分享到小红书/朋友圈，邀请数据会在这里统计</text>
        </view>
        <view class="invite-card-btn" @tap="onInviteCard"><text>生成我的社群邀请卡 ›</text></view>
      </view>
    </view>

    <!-- 待办 -->
    <view class="section">
      <text class="section-title">待处理</text>
      <view class="todo-card" @tap="onTodo('post')">
        <text class="todo-icon">✎</text>
        <view class="todo-info">
          <text class="todo-text">{{ stats.pendingPosts }} 条草稿待发布</text>
          <text class="todo-sub">保持每周至少 2 条动态，成员活跃会明显更高</text>
        </view>
        <text class="todo-arrow">›</text>
      </view>
      <view class="todo-card" @tap="onTodo('event')">
        <text class="todo-icon">◷</text>
        <view class="todo-info">
          <text class="todo-text">{{ stats.upcomingEvents }} 个活动即将开始</text>
          <text class="todo-sub">记得在动态里提醒成员报名</text>
        </view>
        <text class="todo-arrow">›</text>
      </view>
    </view>

    <!-- 快捷操作 -->
    <view class="section">
      <text class="section-title">快捷操作</text>
      <view class="quick-grid">
        <view class="quick-item" @tap="onQuick('post')">
          <text class="quick-icon">✎</text>
          <text class="quick-label">发动态</text>
        </view>
        <view class="quick-item" @tap="onQuick('course')">
          <text class="quick-icon">◆</text>
          <text class="quick-label">上架课程</text>
        </view>
        <view class="quick-item" @tap="onQuick('event')">
          <text class="quick-icon">▪</text>
          <text class="quick-label">创建活动</text>
        </view>
        <view class="quick-item" @tap="onQuick('member')">
          <text class="quick-icon">◦</text>
          <text class="quick-label">成员管理</text>
        </view>
        <view class="quick-item" @tap="onQuick('audit')">
          <text class="quick-icon">○</text>
          <text class="quick-label">内容审核</text>
        </view>
      </view>
    </view>

    <!-- Cdify 导师联盟（导师侧，与用户侧大富翁体系分开） -->
    <view class="section">
      <text class="section-title">Cdify 导师联盟</text>
      <view class="cdify-card">
        <view class="cdify-head">
          <text class="cdify-name">Cdify</text>
          <text class="cdify-sub">疗愈师/培训师专属支持体系 · 五大权益</text>
        </view>
        <view class="cdify-row" v-for="b in CDIFY_BENEFITS" :key="b.title">
          <text class="cdify-icon">{{ b.icon }}</text>
          <view class="cdify-info">
            <text class="cdify-title">{{ b.title }}</text>
            <text class="cdify-desc">{{ b.desc }}</text>
          </view>
        </view>
        <view class="cdify-tip">
          <text>成为一颗种子，成长一片森林。社群积分可兑换联盟活动名额与国际背书资源</text>
        </view>
      </view>
    </view>

    <!-- 积分前三 -->
    <view class="section">
      <text class="section-title">本周积分之星</text>
      <view class="top-card">
        <view v-for="(row, i) in stats.topMembers" :key="row.rank" class="top-row">
          <text class="top-medal">{{ ['🥇', '🥈', '🥉'][i] }}</text>
          <image class="top-avatar" :src="row.avatar" mode="aspectFill" />
          <text class="top-name">{{ row.name }}</text>
          <text class="top-points">{{ row.points }} 分</text>
        </view>
        <view class="top-tip">
          <text>成员积分按「大富翁体系」自动发放，可在社群「排行榜」查看</text>
        </view>
      </view>
    </view>

    <!-- 新成员 -->
    <view class="section">
      <text class="section-title">新加入的成员</text>
      <view class="member-card" v-for="m in stats.recentMembers" :key="m.name">
        <image class="new-avatar" :src="m.avatar" mode="aspectFill" />
        <view class="new-info">
          <text class="new-name">{{ m.name }}</text>
          <text class="new-time">{{ m.time }} 加入</text>
        </view>
        <view class="welcome-btn" @tap="onWelcome(m.name)"><text>欢迎 TA</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { fetchCommunity, WORKSPACE_STATS, type Community } from '@/api/skool'

const statusBarHeight = ref(44)
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 44
} catch (e) { /* fallback */ }

const communityId = ref('cm-3')
const community = ref<Community | undefined>()
const stats = WORKSPACE_STATS

onLoad(async (options) => {
  const id = options?.id || 'cm-3'
  communityId.value = id
  try {
    community.value = await fetchCommunity(id)
  } catch (e) { /* 静默 */ }
})

const monthRevenueYuan = computed(() => (stats.monthRevenue / 100).toFixed(0))
const activeRate = computed(() =>
  stats.memberCount ? Math.round((stats.activeToday / stats.memberCount) * 100) : 0,
)

/** Cdify 导师联盟五大支持（会议校准：认证辅导不叫「卖课」，突出国际背书与可持续发展叙事） */
const CDIFY_BENEFITS = [
  { icon: '●', title: '国际认证对接', desc: '帮现有课程加入可持续发展叙事，对接联合国 SDG 背书，提升证书含金量' },
  { icon: '◆', title: 'TTT 培训体系', desc: '导师授课能力进阶，内部培训与工作坊优先名额' },
  { icon: '🤝', title: '社群互助', desc: '导师互相开课、老带新，积分可兑换大型活动名额' },
  { icon: '▫', title: '商业化辅导', desc: '社群运营与转化路径辅导，不只是发课' },
  { icon: '◌', title: '场地支持', desc: '共享专业场域，线下活动场地优先预约' },
]

function goBack() {
  uni.navigateBack()
}

function goDetail() {
  uni.navigateTo({ url: `/pages/community-detail/index?id=${communityId.value}` })
}

function onTodo(_kind: string) {
  uni.showToast({ title: 'demo：待接真接口', icon: 'none' })
}

function onQuick(kind: string) {
  const map: Record<string, string> = {
    post: '发动态编辑器',
    course: '课程上架（复用现有课程表单）',
    event: '活动创建（线下课自动同步）',
    member: '成员管理列表',
    audit: '内容审核队列',
  }
  uni.showToast({ title: `demo：${map[kind]}`, icon: 'none' })
}

/** 邀请裂变：生成导师个人品牌邀请卡，发到小红书/微信引流回自己社群 */
function onInviteCard() {
  uni.showModal({
    title: '我的社群邀请卡',
    content: `demo：生成「${community.value?.name || '我的社群'}」专属邀请卡（导师个人品牌样式，不带平台 logo 主导），可发到小红书/朋友圈，新会员通过你的链接入会。`,
    confirmText: '生成邀请卡',
    success: (res) => {
      if (res.confirm) uni.showToast({ title: 'demo：邀请卡待接真接口', icon: 'none' })
    },
  })
}

function onWelcome(name: string) {
  uni.showToast({ title: `已向 ${name} 发送欢迎消息`, icon: 'none' })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.status-bar-placeholder { width: 100%; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
.nav-back { width: 32px; height: 32px; border-radius: 16px; background: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; }
.nav-back text { font-size: 18px; color: #584219; }
.nav-title { font-size: 16px; font-weight: 600; color: #3F2F10; }
.nav-right { padding: 4px 8px; }
.nav-right text { font-size: 13px; color: #6D5934; }

.stats-grid { display: flex; flex-wrap: wrap; gap: 10px; padding: 8px 16px; }
.stat-card { width: calc(50% - 5px); box-sizing: border-box; background: #fff; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; }
.stat-value { font-size: 22px; font-weight: 700; color: #584219; }
.stat-label { margin-top: 4px; font-size: 12px; color: #A78E70; }
.stat-trend { margin-top: 6px; font-size: 11px; color: #A78E70; }
.stat-trend.up { color: #584219; }

.section { padding: 8px 16px; }
.section-title { display: block; font-size: 15px; font-weight: 600; color: #3F2F10; margin-bottom: 10px; }

.todo-card { display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
.todo-icon { font-size: 20px; margin-right: 10px; }
.todo-info { flex: 1; }
.todo-text { display: block; font-size: 14px; font-weight: 500; color: #3F2F10; }
.todo-sub { display: block; margin-top: 3px; font-size: 11px; color: #A78E70; }
.todo-arrow { font-size: 18px; color: #A78E70; }

.quick-grid { display: flex; flex-wrap: wrap; row-gap: 14px; background: #fff; border-radius: 12px; padding: 16px 8px; }
.quick-item { flex: 1; min-width: 25%; display: flex; flex-direction: column; align-items: center; }
.quick-icon { font-size: 24px; }
.quick-label { margin-top: 6px; font-size: 12px; color: #6D5934; }

.growth-card { background: #fff; border-radius: 12px; padding: 14px; }
.growth-row { display: flex; }
.growth-item { flex: 1; display: flex; flex-direction: column; align-items: center; }
.growth-value { font-size: 18px; font-weight: 700; color: #584219; }
.growth-label { margin-top: 4px; font-size: 11px; color: #A78E70; }
.growth-tip { margin-top: 12px; background: #EAE0D7; border-radius: 10px; padding: 10px 12px; }
.growth-tip text { font-size: 11px; color: #6D5934; line-height: 1.6; }
.invite-card-btn { margin-top: 12px; background: #584219; border-radius: 20px; padding: 10px; text-align: center; }
.invite-card-btn text { color: #fff; font-size: 14px; font-weight: 600; }

.cdify-card { background: #fff; border-radius: 12px; padding: 14px; }
.cdify-head { margin-bottom: 10px; }
.cdify-name { display: block; font-size: 16px; font-weight: 700; color: #3F2F10; }
.cdify-sub { display: block; margin-top: 2px; font-size: 12px; color: #A78E70; }
.cdify-row { display: flex; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #F4EEE6; }
.cdify-row:last-of-type { border-bottom: none; }
.cdify-icon { font-size: 18px; margin-right: 10px; }
.cdify-info { flex: 1; }
.cdify-title { display: block; font-size: 13px; font-weight: 600; color: #3F2F10; }
.cdify-desc { display: block; margin-top: 2px; font-size: 12px; color: #6D5934; line-height: 1.5; }
.cdify-tip { margin-top: 10px; background: #F4EEE6; border-radius: 10px; padding: 10px 12px; }
.cdify-tip text { font-size: 11px; color: #8C7335; line-height: 1.6; }

.top-card { background: #fff; border-radius: 12px; padding: 12px 14px; }
.top-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #F4EEE6; }
.top-medal { width: 28px; font-size: 16px; }
.top-avatar { width: 32px; height: 32px; border-radius: 16px; margin-right: 10px; background: #F4EEE6; }
.top-name { flex: 1; font-size: 14px; color: #3F2F10; }
.top-points { font-size: 13px; font-weight: 600; color: #584219; }
.top-tip { padding-top: 10px; }
.top-tip text { font-size: 11px; color: #A78E70; line-height: 1.5; }

.member-card { display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
.new-avatar { width: 38px; height: 38px; border-radius: 19px; margin-right: 10px; background: #F4EEE6; }
.new-info { flex: 1; }
.new-name { display: block; font-size: 14px; font-weight: 500; color: #3F2F10; }
.new-time { display: block; margin-top: 2px; font-size: 11px; color: #A78E70; }
.welcome-btn { padding: 6px 14px; border-radius: 14px; background: #EAE0D7; }
.welcome-btn text { font-size: 12px; color: #584219; font-weight: 600; }
</style>
