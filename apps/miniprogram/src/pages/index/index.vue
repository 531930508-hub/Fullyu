<template>
  <view class="page">
    <!-- 顶部导航栏 -->
    <view class="nav-bar">
      <view class="nav-left" @tap="switchLang">
        <text class="lang-btn">{{ language === 'zh' ? '中' : 'En' }}</text>
      </view>
      <view class="nav-center">
        <image class="nav-logo" src="/static/logo.png" mode="heightFix" />
      </view>
      <view class="nav-right">
        <view class="nav-icon" @tap="goMessages">
          <text class="icon-bell">🔔</text>
          <view v-if="hasUnread" class="badge"></view>
        </view>
      </view>
    </view>

    <!-- Banner 区域 -->
    <view class="banner-section">
      <swiper class="banner" autoplay circular :interval="4000">
        <swiper-item v-for="item in banners" :key="item.id">
          <view class="banner-card" :style="{ background: item.bg }">
            <text class="banner-title">{{ item.title }}</text>
            <text class="banner-desc">{{ item.desc }}</text>
          </view>
        </swiper-item>
      </swiper>
    </view>

    <!-- 筛选栏 -->
    <view class="filter-bar">
      <view
        v-for="filter in timeFilters"
        :key="filter.value"
        class="filter-item"
        :class="{ active: currentTimeFilter === filter.value }"
        @tap="setTimeFilter(filter.value)"
      >
        <text>{{ language === 'zh' ? filter.labelZh : filter.labelEn }}</text>
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
            <text class="card-price">¥{{ course.originalPrice }}</text>
          </view>
          <view class="card-tags">
            <text class="card-type-tag" :style="{ background: getCoverColor(course.type) }">{{ course.type }}</text>
            <text class="card-difficulty">{{ course.difficulty }}</text>
          </view>
          <text class="card-meta">📅 {{ formatDate(course.startDate) }} {{ course.startTime }} · {{ course.venue.name }}</text>
          <view class="card-row-bottom">
            <view class="card-trainer">
              <view class="card-trainer-dot">{{ course.trainer.displayName.charAt(0) }}</view>
              <text class="card-trainer-name">{{ course.trainer.displayName }}</text>
            </view>
            <view class="card-seats" :class="{ full: course.currentEnrolled >= course.maxCapacity }">
              <text>{{ course.currentEnrolled >= course.maxCapacity ? '已满' : `余${course.maxCapacity - course.currentEnrolled}位` }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="filteredCourses.length === 0" class="empty">
        <text>{{ language === 'zh' ? '暂无课程' : 'No courses available' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '../../stores/user'
import { listCourses } from '@/api/course'

const userStore = useUserStore()
const language = ref(userStore.language)
const hasUnread = ref(true)
const currentTimeFilter = ref<'' | 'today' | 'week' | 'month'>('')

const banners = ref([
  { id: '1', title: '夏日疗愈季', desc: '正念 · 声疗 · 舞动 三大主题课程上新', bg: 'linear-gradient(135deg, #6B463C, #A07060)' },
  { id: '2', title: '新人专享', desc: '首次体验课仅 ¥79 起', bg: 'linear-gradient(135deg, #4A6741, #7BAF72)' },
  { id: '3', title: '会员权益升级', desc: '年卡尊享每节立减¥50', bg: 'linear-gradient(135deg, #5C4B8A, #9B7FCF)' },
])

const timeFilters = [
  { value: '', labelZh: '全部', labelEn: 'All' },
  { value: 'today', labelZh: '今日', labelEn: 'Today' },
  { value: 'week', labelZh: '本周', labelEn: 'Week' },
  { value: 'month', labelZh: '本月', labelEn: 'Month' },
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
  loadCourses()
})

function getCoverColor(type: string) {
  const map: Record<string, string> = {
    '团课': 'linear-gradient(135deg, #6B463C, #8B6354)',
    '工作坊': 'linear-gradient(135deg, #4A6741, #6B8F62)',
    '体验课': 'linear-gradient(135deg, #5C4B8A, #8B73B8)',
  }
  return map[type] || 'linear-gradient(135deg, #6B463C, #8B6354)'
}

function setTimeFilter(value: string) {
  currentTimeFilter.value = value as '' | 'today' | 'week' | 'month'
  loadCourses()
}

function switchLang() {
  userStore.switchLanguage()
  language.value = userStore.language
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` })
}

function goMessages() {
  uni.showToast({ title: '暂无新消息', icon: 'none' })
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
  background: #F5E8D8;
  padding-bottom: 120rpx;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx;
  height: 88rpx;
  background: #F5E8D8;
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
  color: #6B463C;
  border: 2rpx solid #6B463C;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
}

.nav-icon {
  position: relative;
}

.badge {
  position: absolute;
  top: -4rpx;
  right: -4rpx;
  width: 16rpx;
  height: 16rpx;
  background: #C0392B;
  border-radius: 50%;
}

.banner-section {
  padding: 0 32rpx 24rpx;
}

.banner {
  height: 280rpx;
  border-radius: 24rpx;
  overflow: hidden;
}

.banner-card {
  width: 100%;
  height: 280rpx;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40rpx;
}

.banner-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #FFFFFF;
  margin-bottom: 12rpx;
}

.banner-desc {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.85);
}

.filter-bar {
  display: flex;
  padding: 0 32rpx 24rpx;
  gap: 16rpx;
}

.filter-item {
  padding: 12rpx 28rpx;
  border-radius: 32rpx;
  background: #FFFFFF;
  font-size: 26rpx;
  color: #6B463C;
}

.filter-item.active {
  background: #6B463C;
  color: #FFFFFF;
}

.course-list {
  padding: 0 32rpx;
}

.course-card {
  background: #FFFFFF;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 16rpx;
  box-shadow: 0px 2px 6px rgba(107, 70, 60, 0.06);
  display: flex;
  align-items: stretch;
}

.card-cover {
  width: 160rpx;
  min-height: 160rpx;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 16rpx 0 0 16rpx;
}

.card-cover-img {
  width: 160rpx;
  height: 100%;
  display: block;
}

.card-cover-fallback {
  width: 100%;
  height: 100%;
  min-height: 160rpx;
}

.card-body {
  flex: 1;
  padding: 16rpx 20rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6rpx;
}

.card-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #4B3621;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-price {
  font-size: 28rpx;
  font-weight: 700;
  color: #6B463C;
  flex-shrink: 0;
  margin-left: 12rpx;
}

.card-tags {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.card-type-tag {
  font-size: 20rpx;
  color: #FFF;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
}

.card-difficulty {
  font-size: 20rpx;
  color: #A08A72;
}

.card-meta {
  font-size: 22rpx;
  color: #7D665C;
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

.card-trainer-dot {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: #6B463C;
  color: #FFF;
  font-size: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-trainer-name {
  font-size: 22rpx;
  color: #A08A72;
}

.card-seats {
  font-size: 20rpx;
  color: #A08A72;
  background: #FFF3E0;
  padding: 4rpx 12rpx;
  border-radius: 12rpx;
}

.card-seats.full {
  background: #FFEBEE;
  color: #C0392B;
}

.empty {
  text-align: center;
  padding: 80rpx;
  color: #A08A72;
  font-size: 28rpx;
}
</style>
