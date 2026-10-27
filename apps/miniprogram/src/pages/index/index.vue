<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="brand-header" :style="{ paddingTop: headerOffset + 'px' }">
      <image
        :src="language === 'en' ? '/static/brand/presence-logo-en.png' : '/static/brand/presence-logo-zh.png'"
        class="brand-logo"
        :class="`brand-logo-${language}`"
        mode="heightFix"
        :aria-label="language === 'en' ? 'Full Yu Presence' : 'Full愈·在场'"
      />
      <button class="city-chip" :aria-label="tr('选择城市', 'Choose city')" @tap="openCitySheet">
        <PresenceIcon name="pin" :size="24" />
        <text class="city-chip-name">{{ cityLabel(selectedCity, language) }}</text>
        <PresenceIcon name="chevron" :size="18" />
      </button>
      <view class="header-spacer"></view>
      <button class="language-switch" :aria-label="tr('切换语言', 'Switch language')" @tap="switchLang">
        <PresenceIcon name="globe" :size="28" color="#fffaf0" />
        <text class="lang-option" :class="{ active: language === 'zh' }">中文</text>
        <text class="lang-divider">/</text>
        <text class="lang-option" :class="{ active: language === 'en' }">EN</text>
      </button>
    </view>

    <!-- 运营广告始终位于内容顶部；图片本身有文案时不再叠字 -->
    <view class="banner-section">
      <swiper class="banner" :autoplay="banners.length > 1" :circular="banners.length > 1" :indicator-dots="banners.length > 1" indicator-active-color="#683611" :interval="5000">
        <swiper-item v-for="item in banners" :key="item.id">
          <view class="banner-card" @tap="onBannerTap(item)">
            <image v-if="item.imageUrl" :src="item.imageUrl" mode="aspectFit" class="banner-image" :aria-label="item.title || tr('在场活动', 'Presence event')" />
            <view v-else class="brand-banner"><text class="eyebrow latin">A MOMENT FOR YOURSELF</text><text class="banner-title serif">{{ item.title }}</text><text class="banner-desc">{{ item.subtitle }}</text><PresenceIcon name="leaf" :size="92" color="#96581c" /></view>
          </view>
        </swiper-item>
      </swiper>
    </view>

    <view class="content">
      <view class="greeting-section">
        <view class="greeting-row"><view><text class="greeting-title serif">{{ userStore.isLoggedIn ? tr(`你好，${userStore.userInfo?.nickname || '在场的你'}`, `Hello, ${userStore.userInfo?.nickname || 'there'}`) : tr('给自己一点在场的时间', 'Make a little time for yourself') }}</text><text class="greeting-sub">{{ activeView === 'trainer' ? tr('用心分享，也与同路人一起成长', 'Share with care, grow with your community') : tr('从一节课开始，让身心慢下来', 'Start with one class, let body and mind slow down') }}</text></view></view>
        <view v-if="isTrainer" class="view-switch"><button :class="{ active: activeView === 'student' }" @tap="setView('student')">{{ tr('学员视角', 'Student') }}</button><button :class="{ active: activeView === 'trainer' }" @tap="setView('trainer')">{{ tr('导师视角', 'Trainer') }}</button></view>
        <view v-if="!userStore.isLoggedIn" class="guest-card"><view><text class="entry-title">{{ tr('登录，开启你的在场体验', 'Sign in to begin your practice') }}</text><text class="muted">{{ tr('查看预约、会员卡与积分', 'See bookings, membership and points') }}</text></view><button class="btn-primary" @tap="goProfile">{{ tr('去登录', 'Sign in') }}</button></view>
        <view v-else class="entry-grid">
          <button class="entry-card" @tap="activeView === 'trainer' ? goTrainerWorkspace() : goMember()"><PresenceIcon :name="activeView === 'trainer' ? 'chart' : 'card'" :size="42" /><text class="entry-title">{{ activeView === 'trainer' ? tr('导师工作台', 'Trainer Studio') : activeCard ? tr('我的会员卡', 'My membership') : tr('在场会员', 'Presence membership') }}</text><text class="muted">{{ activeView === 'trainer' ? tr('查看课程与合作记录', 'Classes and collaborations') : activeCard ? tr(`有效至 ${formatDate(activeCard.expiresAt)}`, `Valid until ${formatDate(activeCard.expiresAt)}`) : tr('了解当前会员权益', 'View membership benefits') }}</text></button>
          <button class="entry-card light" @tap="activeView === 'trainer' ? goCommunityMine() : goBookings()"><PresenceIcon :name="activeView === 'trainer' ? 'users' : 'calendar'" :size="42" /><text class="entry-title">{{ activeView === 'trainer' ? tr('我的社群', 'My communities') : tr('我的预约', 'My bookings') }}</text><text class="muted">{{ activeView === 'trainer' ? tr('与学员保持连接', 'Stay connected with students') : tr('课程安排与待支付订单', 'Schedule and pending orders') }}</text></button>
        </view>
      </view>

      <template v-if="activeView === 'trainer'">
        <view class="section-head"><text class="section-title serif">{{ tr('我管理的社群', 'Communities I manage') }}</text><button class="text-button" @tap="goCommunityList">{{ tr('社群广场', 'Community hub') }} ›</button></view>
        <PageState v-if="communitiesLoading" state="loading" />
        <PageState v-else-if="managedError" state="error" :message="tr('社群暂时未能加载', 'Communities are unavailable')" :action="tr('重新加载', 'Reload')" @action="loadCommunities" />
        <view v-else-if="managedCommunities.length" class="managed-list"><button v-for="c in managedCommunities" :key="c.id" class="managed-card" @tap="goCommunityWorkspace(c.id)"><image v-if="c.cover" :src="c.cover" mode="aspectFill" /><PresenceIcon v-else name="users" :size="64" /><view class="managed-info"><text class="entry-title">{{ c.name }}</text><text class="muted">{{ tr(`${c.memberCount} 位成员 · 今日活跃 ${c.activeToday}`, `${c.memberCount} members · ${c.activeToday} active today`) }}</text></view><PresenceIcon name="arrow" :size="32" /></button></view>
        <PageState v-else state="empty" :title="tr('还没有管理中的社群', 'No communities yet')" :message="tr('创建社群后，可在这里分享动态与活动。', 'Create one to share updates and events here.')" />
        <button class="btn-primary" @tap="goCommunityCreate">{{ tr('创建社群', 'Create community') }}</button>
      </template>

      <template v-else>
        <button v-if="nextCourse" class="next-course" @tap="goBookings"><view class="next-icon"><PresenceIcon name="calendar" :size="40" /></view><view class="next-body"><text class="muted">{{ tr('下一场在场', 'Next session') }}</text><text class="entry-title">{{ nextCourse.course.title }}</text><text class="muted">{{ formatDate(nextCourse.course.startDate) }} {{ nextCourse.course.startTime }}</text></view><PresenceIcon name="arrow" :size="32" /></button>
        <view class="section-head"><view><text class="section-title serif">{{ tr('发现好课', 'Find a class') }}</text><text class="section-caption latin">MAKE SPACE FOR YOURSELF</text></view><text class="muted">{{ tr(`${filteredCourses.length} 场课程`, `${filteredCourses.length} classes`) }}</text></view>
        <view class="filter-panel">
          <scroll-view scroll-x class="category-scroll" :show-scrollbar="false"><view class="category-row"><button v-for="category in categories" :key="category" class="category-button" :class="{ active: selectedCategory === category }" @tap="selectedCategory = category">{{ category || tr('全部课程', 'All classes') }}</button></view></scroll-view>
          <scroll-view scroll-x class="date-scroll" :show-scrollbar="false"><view class="date-row"><button class="date-button" :class="{ active: !selectedDate }" @tap="selectedDate = ''"><text>{{ tr('全部', 'All') }}</text><text class="date-number">{{ tr('日期', 'Date') }}</text></button><button v-for="day in days" :key="day.value" class="date-button" :class="{ active: selectedDate === day.value }" @tap="selectedDate = day.value"><text>{{ day.label }}</text><text class="date-number latin">{{ day.day }}</text></button></view></scroll-view>
          <view class="filter-bottom"><picker mode="selector" :range="venues" range-key="name" :value="venueIndex" @change="venueIndex = Number($event.detail.value)"><view class="filter-picker">{{ venues[venueIndex]?.name || tr('全部场地', 'All venues') }}⌄</view></picker><picker mode="selector" :range="difficultyOptions" range-key="label" :value="difficultyIndex" @change="difficultyIndex = Number($event.detail.value)"><view class="filter-picker">{{ difficultyOptions[difficultyIndex].label }}⌄</view></picker><button class="availability" :class="{ selected: onlyAvailable }" @tap="onlyAvailable = !onlyAvailable"><PresenceIcon :name="onlyAvailable ? 'check' : 'users'" :size="26" />{{ tr('仅看有位', 'Available only') }}</button></view>
          <picker mode="date" :value="selectedDate || today" @change="selectedDate = $event.detail.value"><view class="other-date">{{ selectedDate ? tr(`已选 ${selectedDate} · 更换日期`, `${selectedDate} selected · change`) : tr('选择其他日期', 'Choose another date') }}</view></picker>
        </view>
        <PageState v-if="loading" state="loading" :title="tr('正在寻找好课', 'Finding classes')" />
        <PageState v-else-if="loadError" state="error" :message="tr('课程加载失败，请检查网络后重试。', 'Unable to load classes. Check your connection and try again.')" :action="tr('重新加载', 'Reload')" @action="loadCourses" />
        <PageState v-else-if="!filteredCourses.length" state="empty" :title="tr('这次还没有合适的课程', 'No matching classes yet')" :message="tr('换个日期或筛选条件，再找找看。', 'Try another date or filter.')" :action="tr('清除筛选', 'Clear filters')" @action="clearFilters" />
        <view v-else class="course-list"><view v-for="course in filteredCourses" :key="course.id" class="course-card" role="link" tabindex="0" @tap="goDetail(course.id)" @keydown.enter="goDetail(course.id)">
          <view class="card-cover" @tap.stop="previewImage(course.coverImage)"><image v-if="course.coverImage" class="card-cover-img" :src="course.coverImage" mode="aspectFit" :aria-label="course.title" /><BrandCover v-else height="200rpx" :label="tr('在场', 'Presence')" /></view>
          <view class="card-body"><view class="card-tags"><text class="course-tag">{{ typeLabel(course.type) }}</text><text v-if="course.phaseLabel" class="course-tag phase">{{ phaseLabel(course) }}</text><text v-if="course.difficulty" class="muted">{{ difficultyLabel(course.difficulty) }}</text></view><text class="card-title serif">{{ course.title }}</text><text class="card-meta">{{ formatDate(course.startDate) }} {{ course.startTime }}–{{ course.endTime }}</text><text class="card-meta">{{ course.venue?.name || tr('场地待确认', 'Venue TBC') }} · {{ course.trainer?.displayName || tr('导师待确认', 'Guide TBC') }}</text><view class="card-bottom"><text class="card-price latin">¥{{ toYuan(course.originalPrice) }}<text class="price-unit"> / {{ tr('人', 'person') }}</text></text><text class="seat-label" :class="{ full: course.currentEnrolled >= course.maxCapacity }">{{ course.currentEnrolled >= course.maxCapacity ? tr('已满员', 'Full') : tr(`余 ${Math.max(0, course.maxCapacity - course.currentEnrolled)} 位`, `${Math.max(0, course.maxCapacity - course.currentEnrolled)} seats left`) }}</text></view></view>
        </view></view>
        <view class="section-head community-heading"><view><text class="section-title serif">{{ tr('与同路人相遇', 'Meet your community') }}</text><text class="section-caption latin">FIND YOUR COMMUNITY</text></view><button class="text-button" @tap="goCommunityList">{{ tr('全部社群', 'All communities') }} ›</button></view>
        <PageState v-if="communitiesLoading" state="loading" />
        <PageState v-else-if="communityError" state="error" :message="tr('社群暂时未能加载', 'Communities are unavailable')" :action="tr('重试', 'Retry')" @action="loadCommunities" />
        <scroll-view v-else-if="hotCommunities.length" scroll-x class="community-scroll" :show-scrollbar="false"><view class="community-row"><button v-for="c in hotCommunities" :key="c.id" class="community-mini" @tap="goCommunityDetail(c.id)"><image v-if="c.cover" class="community-image" :src="c.cover" mode="aspectFill" /><BrandCover v-else height="180rpx" :label="tr('在场社群', 'Presence community')" icon="users" /><view class="community-body"><text class="entry-title">{{ c.name }}</text><text class="muted">{{ c.owner?.name || tr('主理人', 'Host') }} · {{ c.category }}</text><text class="community-count">{{ tr(`${c.memberCount} 位同路人`, `${c.memberCount} members`) }}</text></view></button></view></scroll-view>
        <PageState v-else state="empty" :title="tr('社群正在生长', 'Communities are growing')" :message="tr('新的相遇，值得期待。', 'New connections are on the way.')" />
      </template>
    </view>
    <BottomSheet :show="citySheetVisible" :title="tr('选择城市', 'Choose a city')" @close="citySheetVisible = false">
      <view class="city-list">
        <button
          v-for="city in cityOptions"
          :key="city"
          class="city-option"
          :class="{ active: selectedCity === city }"
          @tap="chooseCity(city)"
        >
          <view>
            <text class="city-name">{{ cityLabel(city, language) }}</text>
            <text class="city-note">{{ venueCountLabel(city) }}</text>
          </view>
          <PresenceIcon v-if="selectedCity === city" name="check" :size="34" color="#683611" />
        </button>
        <text v-if="cityOptions.length === 1" class="city-more">{{ tr('更多城市将随场地开放', 'More cities as venues open') }}</text>
        <button v-if="venuesError" class="city-retry" @tap="loadVenues">{{ tr('重新读取场地', 'Reload venues') }}</button>
      </view>
    </BottomSheet>
    <view class="tabbar-space"></view><FloatingTabBar active="home" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { listCourses } from '@/api/course'
import { listBanners, type BannerItem } from '@/api/banner'
import { listVenues, type VenueItem } from '@/api/venue'
import { fetchCommunities, fetchMine, type Community } from '@/api/skool'
import { getActiveCard, type MemberCard } from '@/api/member'
import { listMyOrders } from '@/api/order'
import { updateTabBarLanguage, tr, isEnglish } from '@/locale'
import { cityLabel, cityOptionsFromVenues, filterCourseList, normalizeCity, venueIdsForCity } from '@/utils/presence-view'
import FloatingTabBar from '@/components/FloatingTabBar.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'

const userStore = useUserStore()
const { isTrainer, activeView } = storeToRefs(userStore)
const language = computed(() => userStore.language)
const statusBarHeight = ref(0)
// 头部整体下移到微信胶囊下方，语言切换回到右上角也不会与胶囊重叠。
const headerOffset = ref(24)
try {
  const system = uni.getSystemInfoSync()
  statusBarHeight.value = system.statusBarHeight || 0
  const menu = (uni as any).getMenuButtonBoundingClientRect?.()
  if (menu?.bottom) headerOffset.value = Math.max(16, menu.bottom - statusBarHeight.value + 10)
} catch { /* 使用默认留白 */ }
const DEFAULT_BANNERS = (): BannerItem[] => [{ id: 'presence', title: tr('此刻，在场', 'Be here, now'), subtitle: tr('留一点时间，感受真实的自己', 'Take a moment to feel like yourself') }]
const banners = ref<BannerItem[]>(DEFAULT_BANNERS())
const courses = ref<any[]>([])
const loading = ref(false)
const loadError = ref(false)
const selectedCategory = ref('')
const selectedDate = ref('')
const venueIndex = ref(0)
const difficultyIndex = ref(0)
const onlyAvailable = ref(false)
const allVenues = ref<VenueItem[]>([])
const venuesLoading = ref(false)
const venuesError = ref(false)
let venuesRequest = 0
const citySheetVisible = ref(false)
const selectedCity = ref(normalizeCity(uni.getStorageSync('presence_city')))
const difficultyOptions = computed(() => [{ label: tr('全部难度', 'All levels'), value: '' }, { label: tr('入门', 'Beginner'), value: 'BEGINNER' }, { label: tr('进阶', 'Intermediate'), value: 'INTERMEDIATE' }, { label: tr('高级', 'Advanced'), value: 'ADVANCED' }])
const categories = computed(() => ['', ...new Set<string>(courses.value.flatMap(c => c.categories || []))])
const cityOptions = computed(() => cityOptionsFromVenues(allVenues.value, selectedCity.value))
const cityVenueIds = computed(() => venueIdsForCity(allVenues.value, selectedCity.value))
const venues = computed(() => {
  const options = [{ id: '', name: tr('全部场地', 'All venues') }]
  if (allVenues.value.length) {
    return [...options, ...allVenues.value
      .filter(v => cityVenueIds.value.includes(v.id))
      .filter(v => courses.value.some(c => c.venueId === v.id))
      .map(v => ({ id: v.id, name: v.name }))]
  }
  return [...options, ...Array.from(new Map(courses.value.filter(c => c.venueId && c.venue?.name).map(c => [c.venueId, { id: c.venueId, name: c.venue.name }])).values())]
})
const filteredCourses = computed(() => filterCourseList(courses.value, {
  category: selectedCategory.value,
  date: selectedDate.value,
  venueId: venues.value[venueIndex.value]?.id,
  venueIds: allVenues.value.length ? cityVenueIds.value : undefined,
  difficulty: difficultyOptions.value[difficultyIndex.value].value,
  onlyAvailable: onlyAvailable.value,
}))
function cityVenueCount(city: string) {
  return venueIdsForCity(allVenues.value, city).length
}
function venueCountLabel(city: string) {
  // 场地接口未返回时不再显示技术性兜底，改为明确的加载/失败状态。
  if (venuesLoading.value) return tr('正在读取场地…', 'Loading venues…')
  if (venuesError.value) return tr('场地信息暂不可用', 'Venue info unavailable')
  const count = cityVenueCount(city)
  return count ? tr(`${count} 个场地`, `${count} venues`) : tr('场地待开放', 'Venues coming soon')
}
function openCitySheet() {
  citySheetVisible.value = true
  // 首次打开或上次失败时补拉一次，避免把“还没加载”误显示成“没有场地”。
  if (venuesError.value || (!allVenues.value.length && !venuesLoading.value)) loadVenues()
}
function chooseCity(city: string) {
  selectedCity.value = city
  uni.setStorageSync('presence_city', city)
  venueIndex.value = 0
  citySheetVisible.value = false
}
function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const today = ref(localDate(new Date()))
const days = computed(() => Array.from({ length: 7 }, (_, index) => {
  const date = new Date(today.value + 'T12:00:00')
  date.setDate(date.getDate() + index)
  const zhWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  const enWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]
  return { value: localDate(date), day: date.getDate(), label: index === 0 ? tr('今天', 'Today') : index === 1 ? tr('明天', 'Tomorrow') : (isEnglish() ? enWeek : zhWeek) }
}))
let courseRequest = 0
async function loadCourses() {
  const requestId = ++courseRequest
  loading.value = true
  loadError.value = false
  try {
    // 完整读取分页后再本地筛选，避免“仅看有位”等条件漏掉后续页。
    const first = await listCourses({ page: 1, pageSize: 50 })
    const rows = [...(first?.items || [])]
    for (let page = 2; page <= Number(first?.totalPages || 1); page++) {
      if (requestId !== courseRequest) return
      const next = await listCourses({ page, pageSize: 50 })
      rows.push(...(next?.items || []))
    }
    if (requestId === courseRequest) { courses.value = rows; venueIndex.value = 0 }
  } catch { if (requestId === courseRequest) loadError.value = true }
  finally { if (requestId === courseRequest) loading.value = false }
}
async function loadVenues() {
  const requestId = ++venuesRequest
  venuesLoading.value = true
  venuesError.value = false
  try {
    const rows = await listVenues()
    if (requestId === venuesRequest) allVenues.value = Array.isArray(rows) ? rows : []
  } catch {
    // 刷新失败时保留上一次成功结果，避免城市与场地筛选突然清空。
    if (requestId === venuesRequest) venuesError.value = true
  } finally {
    if (requestId === venuesRequest) venuesLoading.value = false
  }
  if (!cityOptions.value.includes(selectedCity.value)) {
    selectedCity.value = cityOptions.value.includes('上海') ? '上海' : cityOptions.value[0]
    uni.setStorageSync('presence_city', selectedCity.value)
  }
  venueIndex.value = 0
}
function clearFilters() { selectedCategory.value = ''; selectedDate.value = ''; venueIndex.value = 0; difficultyIndex.value = 0; onlyAvailable.value = false }
async function loadBanners() { try { const rows = await listBanners(); banners.value = rows?.length ? rows : DEFAULT_BANNERS() } catch { banners.value = DEFAULT_BANNERS() } }
function onBannerTap(item: BannerItem) { if (item.linkType === 'course' && item.linkValue) goDetail(item.linkValue) }
const hotCommunities = ref<Community[]>([])
const managedCommunities = ref<Community[]>([])
const communitiesLoading = ref(false)
const communityError = ref(false)
const managedError = ref(false)
async function loadCommunities() {
  communitiesLoading.value = true; communityError.value = false; managedError.value = false
  try { const rows = await fetchCommunities(); hotCommunities.value = rows.slice(0, 4) } catch { communityError.value = true }
  if (uni.getStorageSync('token') && isTrainer.value) { try { const mine = await fetchMine(); managedCommunities.value = mine?.managed || [] } catch { managedError.value = true } } else managedCommunities.value = []
  communitiesLoading.value = false
}
const activeCard = ref<MemberCard | null>(null)
const nextCourse = ref<any>(null)
async function loadAccount() {
  activeCard.value = null; nextCourse.value = null
  if (!uni.getStorageSync('token')) return
  await Promise.all([
    getActiveCard().then(card => { activeCard.value = card }).catch(() => {}),
    listMyOrders().then(orders => { nextCourse.value = orders.filter(o => o.orderType === 'COURSE' && o.status === 'PAID' && o.course?.startDate && new Date(`${o.course.startDate.slice(0, 10)}T${o.course.startTime || '00:00'}:00`).getTime() > Date.now()).sort((a, b) => String(a.course.startDate + a.course.startTime).localeCompare(String(b.course.startDate + b.course.startTime)))[0] || null }).catch(() => {}),
  ])
}
onShow(() => { if (!uni.getStorageSync('token') && userStore.isLoggedIn) userStore.logout(); today.value = localDate(new Date()); updateTabBarLanguage(); loadVenues(); loadCourses(); loadBanners(); loadCommunities(); loadAccount() })
function setView(mode: 'student' | 'trainer') { userStore.setViewMode(mode) }
function switchLang() {
  userStore.switchLanguage()
  if (banners.value.length === 1 && banners.value[0]?.id === 'presence') banners.value = DEFAULT_BANNERS()
  updateTabBarLanguage()
}
function toYuan(fen: number) { return (Number(fen || 0) / 100).toFixed(fen % 100 === 0 ? 0 : 2) }
function typeLabel(value: string) { return value === 'SERIES' ? tr('系列课程', 'Series') : value === 'SINGLE' ? tr('单次课程', 'Single class') : value }
function difficultyLabel(value: string) {
  const item = difficultyOptions.value.find(option => option.value === value)
  return item?.label || value
}
const PHASE_LABELS: Record<string, [string, string]> = {
  ENROLL_UPCOMING: ['报名未开始', 'Enrollment soon'],
  ENROLLING: ['报名中', 'Enrolling'],
  ENROLL_CLOSED: ['报名截止', 'Enrollment closed'],
  LATE_ENROLLING: ['补报名中', 'Late enrollment'],
  ONGOING: ['进行中', 'In progress'],
}
function phaseLabel(course: any) {
  const item = PHASE_LABELS[course?.phase]
  return item ? tr(item[0], item[1]) : ''
}
function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return tr('时间待确认', 'Time TBC')
  if (isEnglish()) return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]} ${date.getDate()}`
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
function goDetail(id: string) { uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` }) }
function previewImage(url: string) { if (url) uni.previewImage({ urls: [url], current: url }) }
function goProfile() { uni.switchTab({ url: '/pages/profile/index' }) }
function goMember() { uni.switchTab({ url: '/pages/member/index' }) }
function goBookings() { uni.switchTab({ url: '/pages/my-courses/index' }) }
function goTrainerWorkspace() { uni.navigateTo({ url: '/pages/trainer-workspace/index' }) }
function goCommunityList() { uni.navigateTo({ url: '/pages/community-list/index' }) }
function goCommunityDetail(id: string) { uni.navigateTo({ url: `/pages/community-detail/index?id=${id}` }) }
function goCommunityWorkspace(id: string) { uni.navigateTo({ url: `/pages/community-workspace/index?id=${id}` }) }
function goCommunityCreate() { uni.navigateTo({ url: '/pages/community-create/index' }) }
function goCommunityMine() { uni.navigateTo({ url: '/pages/community-mine/index' }) }
</script>

<style scoped>
.brand-header { display: flex; flex-wrap: wrap; align-items: center; gap: 14rpx; row-gap: 12rpx; padding: 0 32rpx 22rpx; }
.brand-logo { display: block; width: auto; flex-shrink: 0; }
.brand-logo-zh { height: 54rpx; }
.brand-logo-en { height: 76rpx; }
.city-chip { margin: 0; flex-shrink: 0; display: flex; align-items: center; gap: 6rpx; padding: 10rpx 4rpx; min-height: 56rpx; background: transparent; border: 0; border-radius: 16rpx; color: var(--c-deep); font-size: 24rpx; line-height: 1.2; }
.city-chip:active { opacity: .58; }
/* H5 端 uni-button 的默认描边会让无底色按钮像输入框，一并移除。 */
.city-chip::after { border: 0; }
.city-chip-name { max-width: 140rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header-spacer { flex: 1; }
.language-switch { margin: 0 0 0 auto; flex-shrink: 0; display: flex; align-items: center; gap: 6rpx; padding: 12rpx 18rpx; min-height: 64rpx; background: var(--c-primary); border: 1.5rpx solid rgba(255, 250, 240, .35); border-radius: 999rpx; box-shadow: 0 8rpx 20rpx rgba(104, 54, 17, .24); color: rgba(255, 250, 240, .72); font-size: 24rpx; line-height: 1.2; }
.lang-option.active { color: #fffaf0; font-weight: 700; }
.lang-divider { color: rgba(255, 250, 240, .48); font-size: 22rpx; }
.section-caption { display: block; color: var(--c-muted); font-size: 18rpx; letter-spacing: 3rpx; margin-top: 6rpx; }
.banner-section { padding: 0 32rpx; }
.banner { height: 300rpx; border-radius: var(--radius-card); overflow: hidden; }
.banner-card,.banner-image { width: 100%; height: 300rpx; }
.brand-banner { position: relative; height: 100%; padding: 36rpx; background: linear-gradient(120deg, #f1dba0, #f3efe0); display: flex; flex-direction: column; justify-content: center; gap: 12rpx; }
.brand-banner :deep(.presence-icon) { position: absolute; right: 32rpx; bottom: 36rpx; opacity: .5; }
.eyebrow { color: var(--c-brown); font-size: 18rpx; letter-spacing: 3rpx; }
.banner-title { font-size: 48rpx; color: var(--c-primary); }
.banner-desc { font-size: 26rpx; color: var(--c-ink); max-width: 460rpx; }
.content { padding: 0 32rpx; }
.greeting-section { margin: 36rpx 0; }
.greeting-row { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-bottom: 24rpx; }
.greeting-title { display: block; font-size: 36rpx; color: var(--c-deep); }
.greeting-sub { display: block; font-size: 24rpx; color: var(--c-muted); margin-top: 8rpx; }
.muted { font-size: 24rpx; line-height: 1.65; color: var(--c-muted); }
.entry-title { display: block; font-size: 28rpx; font-weight: 600; color: var(--c-deep); }
.entry-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20rpx; }
.entry-card { display: flex; flex-direction: column; align-items: flex-start; gap: 10rpx; width: 100%; margin: 0; padding: 28rpx; border-radius: var(--radius-card); background: var(--c-card-2); text-align: left; line-height: 1.5; }
.entry-card.light { background: var(--c-card); }
.guest-card { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; background: var(--c-card); border-radius: var(--radius-card); padding: 28rpx; }
.guest-card .btn-primary { flex-shrink: 0; margin: 0; padding: 16rpx 24rpx; }
.view-switch { display: flex; padding: 6rpx; background: var(--c-card-2); border-radius: 24rpx; margin-bottom: 24rpx; }
.view-switch button { flex: 1; margin: 0; border-radius: 20rpx; background: transparent; color: var(--c-muted); font-size: 26rpx; }
.view-switch .active { background: var(--c-primary); color: white; }
.next-course { display: flex; align-items: center; gap: 20rpx; width: 100%; margin: 0 0 36rpx; padding: 26rpx; background: var(--c-card); border: 1rpx solid var(--line-soft); border-radius: var(--radius-card); text-align: left; line-height: 1.5; }
.next-icon { padding: 20rpx; border-radius: 24rpx; background: var(--c-card-2); }
.next-body { flex: 1; min-width: 0; }
.next-body .muted { display: block; }
.section-head { margin: 32rpx 0 24rpx; }
.section-title { font-size: 38rpx; }
.text-button { background: transparent; font-size: 24rpx; color: var(--c-primary); margin: 0; padding: 12rpx 0 12rpx 16rpx; }
.filter-panel { background: var(--c-card); border-radius: var(--radius-card); padding: 24rpx 20rpx 12rpx; margin-bottom: 24rpx; }
.category-row,.date-row { display: flex; gap: 12rpx; }
.category-button { white-space: nowrap; flex-shrink: 0; margin: 0; padding: 4rpx 24rpx; border-radius: 20rpx; font-size: 26rpx; color: var(--c-muted); background: var(--c-cream); }
.category-button.active,.date-button.active { background: var(--c-primary); color: white; }
.date-scroll { margin-top: 24rpx; }
.date-button { flex-shrink: 0; display: flex; flex-direction: column; justify-content: center; gap: 6rpx; width: 76rpx; min-height: 110rpx; padding: 8rpx 0; margin: 0; border-radius: 20rpx; background: transparent; color: var(--c-muted); font-size: 24rpx; line-height: 1.5; }
.date-number { font-size: 30rpx; }
.filter-bottom { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12rpx; border-top: 1rpx solid var(--line-soft); margin-top: 20rpx; padding-top: 12rpx; }
.filter-picker { font-size: 24rpx; padding: 18rpx 0; color: var(--c-muted); }
.availability { display: flex; gap: 8rpx; align-items: center; font-size: 24rpx; padding: 12rpx 0; margin: 0; background: transparent; color: var(--c-muted); }
.availability.selected { color: var(--c-primary); font-weight: 600; }
.other-date { color: var(--c-brown); font-size: 24rpx; padding: 12rpx 0; text-align: center; }
.course-card { display: flex; align-items: center; gap: 24rpx; background: var(--c-card); border-radius: var(--radius-card); padding: 24rpx; margin-bottom: 20rpx; box-shadow: var(--shadow-card); }
.card-cover { width: 176rpx; flex-shrink: 0; height: 200rpx; border-radius: 24rpx; overflow: hidden; background: var(--c-card-2); }
.card-cover-img { width: 100%; height: 100%; }
.card-body { min-width: 0; flex: 1; }
.card-tags { display: flex; align-items: center; gap: 12rpx; flex-wrap: wrap; margin-bottom: 8rpx; }
.course-tag { font-size: 24rpx; padding: 2rpx 12rpx; background: var(--c-card-2); color: var(--c-brown); border-radius: 8rpx; }
.course-tag.phase { background: #fbf1df; color: #8a5a17; }
.card-title { display: block; font-size: 32rpx; line-height: 1.4; color: var(--c-deep); margin-bottom: 12rpx; }
.card-meta { display: block; font-size: 24rpx; color: var(--c-muted); line-height: 1.7; }
.card-bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 8rpx; flex-wrap: wrap; margin-top: 16rpx; }
.card-price { font-size: 34rpx; font-weight: 600; color: var(--c-primary); }
.price-unit { font-size: 22rpx; color: var(--c-muted); font-weight: 400; }
.seat-label { font-size: 24rpx; color: var(--c-brown); }
.seat-label.full { color: var(--c-muted); }
.community-heading { margin-top: 44rpx; }
.community-row { display: flex; gap: 20rpx; padding-bottom: 8rpx; }
.community-mini { flex-shrink: 0; width: 308rpx; padding: 0; margin: 0; border-radius: var(--radius-card); overflow: hidden; background: var(--c-card); text-align: left; line-height: 1.5; }
.community-image { display: block; width: 100%; height: 180rpx; }
.community-body { padding: 24rpx; }
.community-body .muted { display: block; margin-top: 8rpx; }
.community-count { display: block; font-size: 24rpx; color: var(--c-brown); margin-top: 12rpx; }
.managed-card { display: flex; align-items: center; gap: 20rpx; padding: 28rpx; margin-bottom: 20rpx; background: var(--c-card); border-radius: var(--radius-card); text-align: left; line-height: 1.5; }
.managed-card image { width: 96rpx; height: 96rpx; border-radius: 20rpx; flex-shrink: 0; }
.managed-info { flex: 1; min-width: 0; }
.city-list { display: flex; flex-direction: column; gap: 12rpx; padding-bottom: 8rpx; }
.city-option { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; width: 100%; margin: 0; padding: 24rpx 26rpx; background: var(--c-cream); border: 1rpx solid transparent; border-radius: 24rpx; text-align: left; line-height: 1.4; }
.city-option.active { background: var(--c-card-2); border-color: rgba(104, 54, 17, .28); }
.city-name { display: block; font-size: 30rpx; font-weight: 600; color: var(--c-deep); }
.city-note { display: block; font-size: 22rpx; color: var(--c-muted); margin-top: 4rpx; }
.city-more { display: block; text-align: center; font-size: 22rpx; color: var(--c-muted); padding: 18rpx 0 8rpx; }
.city-retry { margin: 8rpx auto 0; padding: 14rpx 24rpx; background: transparent; color: var(--c-primary); font-size: 24rpx; line-height: 1.4; }
@media (min-width: 600px) {
  /* H5 宽屏时页面仍限宽 480px，rpx 却按窗口放大；用 px 收敛头部保证单行不折行 */
  .brand-header { gap: 10px; padding: 0 20px 14px; }
  .brand-logo-zh { height: 36px; }
  .brand-logo-en { height: 48px; }
  .city-chip { padding: 6px 2px; gap: 4px; min-height: 34px; font-size: 13px; }
  .language-switch { padding: 7px 11px; gap: 4px; min-height: 34px; font-size: 13px; }
  .lang-divider { font-size: 12px; }
}
@media (max-width: 360px) { .card-cover { width: 140rpx; } .course-card { gap: 16rpx; padding: 20rpx; } .guest-card { flex-wrap: wrap; } }
</style>
