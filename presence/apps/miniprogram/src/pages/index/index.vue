<template>
  <view class="page">
    <!-- 顶部导航栏 -->
    <view class="status-bar-placeholder" :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="nav-bar">
      <view class="nav-left" @tap="switchLang">
        <text class="lang-btn">{{ language === 'zh' ? '中' : 'En' }}</text>
      </view>
      <view class="nav-center">
        <image class="nav-logo" src="/static/logo.png" mode="heightFix" />
      </view>
      <view class="nav-right">
        <!-- 双视角切换：仅导师身份可见 -->
        <view v-if="isTrainer" class="view-switch">
          <view class="view-opt" :class="{ active: activeView === 'student' }" @tap="setView('student')">
            <text>选课</text>
          </view>
          <view class="view-opt" :class="{ active: activeView === 'trainer' }" @tap="setView('trainer')">
            <text>导师</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 导师视角：经营我的社群（Skool 式落地页） -->
    <template v-if="activeView === 'trainer'">
      <view class="trainer-hero">
        <text class="trainer-hero-title serif">你好，{{ userStore.userInfo?.nickname || '导师' }}</text>
        <text class="trainer-hero-sub">在这里经营你的社群：发动态、上架课程、创建活动</text>
      </view>
      <view class="section-head">
        <text class="section-title">我管理的社群</text>
        <text class="section-more" @tap="goCommunityList">去广场 ›</text>
      </view>
      <view class="trainer-comm-list">
        <view v-for="c in managedCommunities" :key="c.id" class="trainer-comm-card" @tap="goCommunityWorkspace(c.id)">
          <view class="trainer-comm-cover" :style="{ background: c.coverFallback }">
            <image class="trainer-comm-img" :src="c.cover" mode="aspectFill" />
          </view>
          <view class="trainer-comm-info">
            <text class="trainer-comm-name">{{ c.name }}</text>
            <text class="trainer-comm-meta">{{ c.memberCount }} 成员 · 今日活跃 {{ c.activeToday }}</text>
          </view>
          <view class="trainer-comm-go"><text>管理 ›</text></view>
        </view>
        <view v-if="!managedCommunities.length" class="trainer-empty">
          <text>你还没有社群，创建后就可以在这里经营你的学员了</text>
        </view>
      </view>
      <view class="trainer-actions">
        <view class="trainer-btn primary" @tap="goCommunityCreate"><text>＋ 创建社群</text></view>
        <view class="trainer-btn" @tap="goCommunityMine"><text>我的社群</text></view>
      </view>
    </template>

    <!-- 学员视角：课程 + 社群入口 -->
    <template v-else>
    <!-- Banner 区域 -->
    <view class="banner-section">
      <swiper class="banner" autoplay circular :interval="4000">
        <swiper-item v-for="item in banners" :key="item.id">
          <view
            class="banner-card"
            :style="item.imageUrl ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: item.bg }"
            @tap="onBannerTap(item)"
          >
            <text class="banner-title serif">{{ item.title }}</text>
            <text class="banner-desc">{{ item.subtitle }}</text>
          </view>
        </swiper-item>
      </swiper>
    </view>

    <!-- 社群推荐：课程视角的第二入口 -->
    <view class="section-head">
      <text class="section-title">导师社群</text>
      <text class="section-more" @tap="goCommunityList">全部 ›</text>
    </view>
    <scroll-view scroll-x class="community-scroll" :show-scrollbar="false">
      <view v-for="c in hotCommunities" :key="c.id" class="community-mini" @tap="goCommunityDetail(c.id)">
        <view class="community-mini-cover" :style="{ background: c.coverFallback }">
          <image class="community-mini-img" :src="c.cover" mode="aspectFill" />
        </view>
        <view class="community-mini-body">
          <text class="community-mini-name">{{ c.name }}</text>
          <text class="community-mini-owner">{{ c.owner.name }} · {{ c.category }}</text>
          <text class="community-mini-meta">{{ c.memberCount }} 成员{{ c.yearlyFee === 0 ? ' · 免费' : '' }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- 筛选栏 -->
    <view class="filter-bar">
      <view
        v-for="filter in timeFilters"
        :key="filter.value"
        class="filter-item"
        :class="{ active: currentTimeFilter === filter.value }"
        @tap="setTimeFilter(filter.value)"
      >
        <text>{{ t(filter.labelKey) }}</text>
      </view>
    </view>

    <!-- 课程列表 -->
    <view class="course-list">
      <view
        v-for="course in filteredCourses"
        :key="course.id"
        class="course-card"
        @tap="goDetail(course.id)"
      >
        <view class="card-cover" @tap.stop="previewImage(course.coverImage)">
          <image
            v-if="course.coverImage"
            class="card-cover-img"
            :src="course.coverImage"
            mode="aspectFill"
          />
          <view v-else class="card-cover-fallback" :style="{ background: getCoverColor(course.type) }"></view>
        </view>
        <view class="card-body">
          <view class="card-row-top">
            <text class="card-title">{{ course.title }}</text>
            <text class="card-price latin">¥{{ toYuan(course.originalPrice) }}</text>
          </view>
          <view class="card-tags">
            <text class="card-type-tag">{{ typeLabel(course.type) }}</text>
            <text class="card-difficulty">{{ difficultyLabel(course.difficulty) }}</text>
          </view>
          <text class="card-meta">{{ formatDate(course.startDate) }} {{ course.startTime }} · {{ course.venue.name }}</text>
          <view class="card-row-bottom">
            <view class="card-trainer">
              <image v-if="course.trainer.avatar" class="card-trainer-img" :src="course.trainer.avatar" mode="aspectFill" />
              <view v-else class="card-trainer-dot">{{ course.trainer.displayName.charAt(0) }}</view>
              <text class="card-trainer-name">{{ course.trainer.displayName }}</text>
            </view>
            <view class="card-seats" :class="{ full: course.currentEnrolled >= course.maxCapacity }">
              <text>{{ course.currentEnrolled >= course.maxCapacity ? '满员' : `余${course.maxCapacity - course.currentEnrolled}位` }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="filteredCourses.length === 0" class="empty">
        <text>{{ t('home.noCourses') }}</text>
      </view>
    </view>
    </template>

    <!-- 悬浮 TabBar 预留空间 -->
    <view class="tabbar-space"></view>
    <floating-tab-bar active="home" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useUserStore } from '../../stores/user'
import { listCourses } from '@/api/course'
import { listBanners, type BannerItem } from '@/api/banner'
import { fetchCommunities, fetchMine, type Community } from '@/api/skool'
import { t, updateTabBarLanguage } from '@/locale'
import FloatingTabBar from '@/components/FloatingTabBar.vue'

const userStore = useUserStore()
const { isTrainer, activeView } = storeToRefs(userStore)

function setView(mode: 'student' | 'trainer') {
  userStore.setViewMode(mode)
}

// 社群
const hotCommunities = ref<Community[]>([])
const managedCommunities = ref<Community[]>([])
async function loadCommunities() {
  try {
    const res = await fetchCommunities()
    hotCommunities.value = (Array.isArray(res) ? res : []).slice(0, 4)
  } catch (e) { /* 静默 */ }
  if (uni.getStorageSync('token')) {
    try {
      const mine = await fetchMine()
      managedCommunities.value = mine?.managed || []
    } catch (e) {
      managedCommunities.value = []
    }
  } else {
    managedCommunities.value = []
  }
}
function goCommunityList() {
  uni.navigateTo({ url: '/pages/community-list/index' })
}
function goCommunityDetail(id: string) {
  uni.navigateTo({ url: `/pages/community-detail/index?id=${id}` })
}
function goCommunityWorkspace(id: string) {
  uni.navigateTo({ url: `/pages/community-workspace/index?id=${id}` })
}
function goCommunityCreate() {
  uni.navigateTo({ url: '/pages/community-create/index' })
}
function goCommunityMine() {
  uni.navigateTo({ url: '/pages/community-mine/index' })
}

// 分→元转换
function toYuan(fen: number) {
  return (fen / 100).toFixed(fen % 100 === 0 ? 0 : 2)
}

// 课程类型/难度枚举→中文
function typeLabel(v: string) {
  const map: Record<string, string> = { SINGLE: '单次课程', SERIES: '系列课程' }
  return map[v] || v
}
function difficultyLabel(v: string) {
  const map: Record<string, string> = { BEGINNER: '入门', INTERMEDIATE: '进阶', ADVANCED: '高级' }
  return map[v] || v
}
const language = ref(userStore.language)
const statusBarHeight = ref(44)
try {
  const sysInfo = uni.getSystemInfoSync()
  statusBarHeight.value = sysInfo.statusBarHeight || 44
} catch (e) { /* fallback */ }
const currentTimeFilter = ref<'' | 'today' | 'week' | 'month'>('')

// 默认运营位：暖棕统一，禁用蓝紫渐变
const DEFAULT_BANNERS: BannerItem[] = [
  { id: '1', title: '秋日疗愈季', subtitle: '正念 · 声疗 · 舞动 三大主题课程上新', bg: 'linear-gradient(135deg, #584219, #6D5934)' },
  { id: '2', title: '新人专享', subtitle: '首次体验课仅 ¥79 起', bg: 'linear-gradient(135deg, #3F2F10, #584219)' },
  { id: '3', title: '会员权益升级', subtitle: '年卡尊享每节立减¥50', bg: 'linear-gradient(135deg, #6D5934, #C9A35C)' },
]

const banners = ref<BannerItem[]>(DEFAULT_BANNERS)

async function loadBanners() {
  try {
    const rows = await listBanners()
    if (rows && rows.length) banners.value = rows
  } catch (e) {
    // 加载失败时保留默认运营位
  }
}

function onBannerTap(item: BannerItem) {
  if (item.linkType === 'course' && item.linkValue) {
    uni.navigateTo({ url: `/pages/course-detail/index?id=${item.linkValue}` })
  }
}

const timeFilters = [
  { value: '', labelKey: 'home.all' },
  { value: 'today', labelKey: 'home.today' },
  { value: 'week', labelKey: 'home.week' },
  { value: 'month', labelKey: 'home.month' },
]

const courses = ref<any[]>([])

const filteredCourses = computed(() => courses.value)

async function loadCourses() {
  try {
    const res = await listCourses({
      pageSize: 50,
      time: currentTimeFilter.value || undefined,
    })
    courses.value = res?.items ?? []
  } catch (e) {
    courses.value = []
  }
}

onShow(() => {
  language.value = userStore.language
  updateTabBarLanguage()
  loadCourses()
  loadBanners()
  loadCommunities()
})

function getCoverColor(type: string) {
  const map: Record<string, string> = {
    SINGLE: '#6D5934',
    SERIES: '#584219',
  }
  return map[type] || '#584219'
}

function setTimeFilter(value: string) {
  currentTimeFilter.value = value as '' | 'today' | 'week' | 'month'
  loadCourses()
}

function switchLang() {
  userStore.switchLanguage()
  language.value = userStore.language
  updateTabBarLanguage()
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` })
}

function previewImage(url: string) {
  if (!url) return
  uni.previewImage({ urls: [url], current: url })
}

function formatDate(date: string) {
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #EAE0D7;
}

.status-bar-placeholder {
  background: #EAE0D7;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx;
  height: 88rpx;
  background: #EAE0D7;
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-logo {
  height: 52rpx;
  width: 104rpx;
}

.lang-btn {
  font-size: 24rpx;
  color: #584219;
  border: 2rpx solid rgba(88, 66, 25, 0.35);
  border-radius: 999rpx;
  padding: 4rpx 20rpx;
  letter-spacing: 1rpx;
}

/* ===== Banner ===== */
.banner-section {
  padding: 16rpx 32rpx 32rpx;
}

.banner {
  height: 300rpx;
  border-radius: 44rpx;
  overflow: hidden;
}

.banner-card {
  width: 100%;
  height: 300rpx;
  border-radius: 44rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48rpx;
}

.banner-title {
  font-size: 40rpx;
  color: #F7F2E9;
  margin-bottom: 16rpx;
}

.banner-desc {
  font-size: 26rpx;
  color: rgba(247, 242, 233, 0.8);
  letter-spacing: 1rpx;
}

/* ===== 模块标题（衬线 + 右侧灰字）由全局 .section-head 提供 ===== */
.section-head {
  padding: 0 32rpx;
}

/* ===== 筛选栏：胶囊 ===== */
.filter-bar {
  display: flex;
  padding: 8rpx 32rpx 28rpx;
  gap: 16rpx;
}

.filter-item {
  padding: 10rpx 32rpx;
  border-radius: 999rpx;
  background: #F4EEE6;
  font-size: 26rpx;
  color: #6D5934;
  letter-spacing: 1rpx;
}

.filter-item.active {
  background: #584219;
  color: #F7F2E9;
}

/* ===== 课程卡片（22px 圆角） ===== */
.course-list {
  padding: 0 32rpx;
}

.course-card {
  background: #FBF8F3;
  border-radius: 44rpx;
  overflow: hidden;
  margin-bottom: 28rpx;
  box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05);
  display: flex;
  align-items: stretch;
}
.course-card:active {
  transform: scale(0.98);
}

.card-cover {
  width: 180rpx;
  min-height: 180rpx;
  flex-shrink: 0;
  overflow: hidden;
}

.card-cover-img {
  width: 180rpx;
  height: 100%;
  display: block;
}

.card-cover-fallback {
  width: 100%;
  height: 100%;
  min-height: 180rpx;
}

.card-body {
  flex: 1;
  padding: 22rpx 24rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8rpx;
}

.card-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #3F2F10;
  letter-spacing: 1rpx;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-price {
  font-size: 32rpx;
  font-weight: 600;
  color: #584219;
  flex-shrink: 0;
  margin-left: 12rpx;
}

.card-tags {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.card-type-tag {
  font-size: 20rpx;
  color: #B06A3F;
  background: rgba(211, 149, 110, 0.16);
  padding: 2rpx 16rpx;
  border-radius: 999rpx;
  letter-spacing: 1rpx;
}

.card-difficulty {
  font-size: 20rpx;
  color: #A78E70;
}

.card-meta {
  font-size: 22rpx;
  color: #6D5934;
}

.card-row-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-trainer {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.card-trainer-img {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.card-trainer-dot {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: #584219;
  color: #F7F2E9;
  font-size: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-trainer-name {
  font-size: 22rpx;
  color: #A78E70;
}

.card-seats {
  font-size: 20rpx;
  color: #B06A3F;
  background: rgba(211, 149, 110, 0.16);
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
}

.card-seats.full {
  background: rgba(88, 66, 25, 0.08);
  color: #A78E70;
}

.empty {
  text-align: center;
  padding: 100rpx 0;
  color: #A78E70;
  font-size: 28rpx;
  letter-spacing: 1rpx;
}

/* ===== 双视角切换 ===== */
.nav-right {
  width: auto;
  display: flex;
  justify-content: flex-end;
}
.view-switch {
  display: flex;
  background: rgba(88, 66, 25, 0.08);
  border-radius: 999rpx;
  padding: 4rpx;
}
.view-opt {
  padding: 6rpx 22rpx;
  border-radius: 999rpx;
}
.view-opt text {
  font-size: 22rpx;
  color: #6D5934;
}
.view-opt.active {
  background: #584219;
}
.view-opt.active text {
  color: #F7F2E9;
}

/* ===== 导师视角落地页 ===== */
.trainer-hero {
  padding: 16rpx 32rpx 28rpx;
  display: flex;
  flex-direction: column;
}
.trainer-hero-title {
  font-size: 44rpx;
  color: #3F2F10;
}
.trainer-hero-sub {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #A78E70;
  letter-spacing: 1rpx;
}
.trainer-comm-list {
  padding: 0 32rpx;
}
.trainer-comm-card {
  display: flex;
  align-items: center;
  background: #FBF8F3;
  border-radius: 44rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05);
}
.trainer-comm-cover {
  width: 96rpx;
  height: 96rpx;
  border-radius: 28rpx;
  overflow: hidden;
  margin-right: 24rpx;
}
.trainer-comm-img {
  width: 96rpx;
  height: 96rpx;
  display: block;
}
.trainer-comm-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.trainer-comm-name {
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  color: #3F2F10;
}
.trainer-comm-meta {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #A78E70;
}
.trainer-comm-go {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: #584219;
}
.trainer-comm-go text {
  color: #F7F2E9;
  font-size: 24rpx;
  letter-spacing: 1rpx;
}
.trainer-empty {
  background: #FBF8F3;
  border-radius: 44rpx;
  padding: 60rpx 36rpx;
  text-align: center;
}
.trainer-empty text {
  font-size: 24rpx;
  color: #A78E70;
  line-height: 1.9;
}
.trainer-actions {
  display: flex;
  gap: 20rpx;
  padding: 28rpx 32rpx;
}
.trainer-btn {
  flex: 1;
  border-radius: 999rpx;
  padding: 24rpx 0;
  text-align: center;
  background: transparent;
  border: 2rpx solid #584219;
}
.trainer-btn text {
  font-size: 28rpx;
  color: #584219;
  letter-spacing: 2rpx;
}
.trainer-btn.primary {
  background: #584219;
  border: none;
}
.trainer-btn.primary text {
  color: #F7F2E9;
}

/* ===== 学员视角：社群推荐横滑 ===== */
.community-scroll {
  white-space: nowrap;
  padding: 0 32rpx 32rpx;
}
.community-mini {
  display: inline-flex;
  flex-direction: column;
  width: 300rpx;
  border-radius: 36rpx;
  margin-right: 20rpx;
  vertical-align: top;
  background: #FBF8F3;
  overflow: hidden;
  box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05);
}
.community-mini-cover {
  width: 300rpx;
  height: 169rpx; /* 16:9 */
}
.community-mini-img {
  width: 300rpx;
  height: 169rpx;
  display: block;
}
.community-mini-body {
  padding: 22rpx 26rpx 26rpx;
}
.community-mini-name {
  font-size: 28rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  color: #3F2F10;
  white-space: normal;
}
.community-mini-owner {
  margin-top: 10rpx;
  font-size: 20rpx;
  color: #A78E70;
  display: block;
}
.community-mini-meta {
  margin-top: 12rpx;
  font-size: 20rpx;
  color: #6D5934;
  display: block;
}
</style>
