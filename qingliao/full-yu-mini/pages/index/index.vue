<template>
	<view class="min-h-screen index pb-[160rpx]">
		<view class="header px-4 pb-2 flex items-center" :class="{ 'header-bg': isScrolled }" :style="{ paddingTop: statusBar + 'px', height: customBar + 'px' }">
			<view class="flex" style="width: 208rpx;" :style="{color: swiperIndex==0?'#f2e8cd' : ''}">
				<image v-if="swiperIndex==0" class="mr-1" src="/static/icons/map-marker-alt-solid-yellow.svg" style="width: 30rpx; height: 30rpx; margin-top: 3px;"/>
				<image v-else class="mr-1" src="/static/icons/map-marker-alt-solid.svg" style="width: 30rpx; height: 30rpx; margin-top: 3px;"/>
				<text>{{ shop.shortAddress }}</text>
			</view>
			<image v-if="swiperIndex==1" class="w-[180rpx] h-8 ml-[7%]" src="/static/icons/logo.png"/>
			<image v-else class="w-[180rpx] h-8 ml-[7%]" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/logo2.png"/>
			<view></view>
		</view>
		<view class="main overflow-y-auto h-full">
		<!-- 轮播图区域 -->
		<view class="relative">
			<swiper @change="handleSwiperChange"
				class="w-full h-[1048rpx]"
				:indicator-dots="false"
				:autoplay="true"
				:interval="5000"
				:duration="500">
				<swiper-item v-for="(item, index) in bannerList" :key="index">
					<view class="w-full h-full relative overflow-hidden" @click="go_page('/pages/mall/mall')">
						<image :src="item.url"
							class="w-full h-full object-cover"
							mode="aspectFill"/>
					</view>
				</swiper-item>
			</swiper>
			<!-- 自定义指示器 -->
			<view class="custom-indicator">
				<view v-for="(item, index) in bannerList" :key="index"
					class="indicator-dot"
					:class="{ 'active': index === swiperIndex }">
				</view>
			</view>
		</view>

		<view class="px-5 pt-2 pb-8">
			<view class=" bg-white rounded-2xl">
				<!-- 顶部用户栏 -->
				<view @click="go_page('/pages/mall/mall?tab=mine')" class="flex items-center justify-between px-4 py-2 rounded-t-xl bg-[#726B44] text-white">
					<text>{{ userInfo.nickname }}</text>
					<text class="text-xs text-[#FFFFFFA6]">可享受<text class="font-medium text-[34rpx] ml-1 text-white">{{ userInfo.couponCount*15 || 0}}</text> mins Full愈时刻</text>
				</view>

				<!-- 功能区块 -->
				<view class="flex justify-around pt-6 pb-8">
					<!-- 预约 -->
					<view @click="go_page('/pages/index/booking')" class="flex flex-col ">
						<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0626/index-2.png" class="w-[144rpx] h-[144rpx] mx-auto mb-5" mode="aspectFit"/>
						<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0626/index-1-text.png" class="w-[290rpx] h-[86rpx]" mode="aspectFit"/>
					</view>
					<view style="border-left: 1px dashed #5842191A;"></view>
					<!-- 送心意 -->
					<view @click="go_page('/pages/mall/mall')" class="flex flex-col">
						<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0626/index-1.png" class="w-[144rpx] h-[144rpx] mx-auto mb-5" mode="aspectFit"/>
						<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0626/index-2-text.png" class="w-[290rpx] h-[82rpx]" mode="aspectFit"/>
					</view>
				</view>
			</view>

			<view class="flex items-center justify-center mt-8 mb-4">
				<view class="w-16 h-[1px] border-t border-dashed" style="border-color: #5842191A"></view>
				<image class="w-[120rpx] h-[44rpx] mx-4" src="/static/icons/index-split-text.png" mode="aspectFit"/>
				<view class="w-16 h-[1px] border-t border-dashed" style="border-color: #5842191A"></view>
			</view>

			<!-- 三卡片切换动画区块 -->
			<view class="flex flex-row items-end justify-center h-[600rpx]">
				<view v-for="(card, idx) in cards" :key="card.key"
					:class="[
					selectedCard === idx ? 'transition-all duration-500 w-[225px] h-full rounded-2xl shadow-none' : 'transition-all duration-500 w-[60px] h-full rounded-2xl z-0',
					'overflow-hidden flex flex-col items-center justify-end cursor-pointer relative'
					]"
					:style="{
					height: '600rpx',
					width: selectedCard === idx ? '450rpx' : '112rpx',
					transition: 'width 0.6s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 0.5s cubic-bezier(0.22, 0.61, 0.36, 1), background 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)',
					willChange: 'width, box-shadow, background',
					boxShadow: 'none',
					background: selectedCard === idx
							? 'url(' + card.bg + ') center/cover no-repeat'
							: 'url(' + card.minibg + ') center/cover no-repeat',
					marginRight: idx < cards.length - 1 ? '16rpx' : '0'
					}"
					@click="selectCard(idx)">
					<!-- 展开时显示大图和全部内容 -->
					<template v-if="selectedCard === idx">
						<!-- <view class="absolute inset-0" style="background:rgba(0,0,0,0.15);"></view> -->
						<!-- <view class="flex flex-col items-center justify-end h-full w-full relative z-1 px-4 pt-8 pb-6">
							<view class="text-white text-[44rpx] font-bold mb-1" style="font-family: 'Noto Serif SC', 'STFangsong', serif; text-shadow:none; letter-spacing:2px;">{{ card.title }}</view>
							<view v-if="card.subtitle" class="text-white text-[30rpx] opacity-80" style="font-family: 'Fangsong'">{{ card.subtitle }}</view>
							<view v-if="card.desc" class="text-white text-xs leading-tight opacity-90 mt-auto text-center" style="margin-bottom:24px;">{{ card.desc }}</view>
						</view> -->
					</template>
					<!-- 收缩时仅显示主题，图片高度不变，标题竖排 -->
					<template v-else>
						<view class="flex flex-col items-center justify-end h-full w-full pb-6">
							<!-- <view class="text-white text-[44rpx] " style="writing-mode:vertical-rl;letter-spacing:2px;font-family:'Noto Serif SC','STFangsong',serif;">{{ card.title }}</view> -->
						</view>
					</template>
				</view>
			</view>

			<!-- <view class="flex items-center justify-center mt-8 mb-4">
				<view class="w-16 h-[1px] border-t border-dashed" style="border-color: #5842191A"></view>
				<view class="mx-4 text-[34rpx]" style="color: #584219">品牌理念</view>
				<view class="w-16 h-[1px] border-t border-dashed" style="border-color: #5842191A"></view>
			</view>
			<view>
				<img src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/%E5%93%81%E7%89%8C%E7%90%86%E5%BF%B5.jpg" class="w-full h-[340rpx] object-cover rounded-xl" mode="aspectFit" />
			</view> -->
		</view>
	</view>
		<CustomTabBar :selected="0" :list="tabBarList" />
	</view>
</template>

<script setup>
import CustomTabBar from '../../components/CustomTabBar.vue';
import {onLoad, onShareAppMessage, onShareTimeline, onShow, onPageScroll} from "@dcloudio/uni-app"
import {ref, computed,getCurrentInstance} from 'vue'
import miniImageApi from "../../api/miniImage"
import cookie from "../../utils/cookieUtil"
import customerApi from '../../api/customer'
const {proxy} = getCurrentInstance()
const vm = proxy

// 用户信息
const userInfo = ref({
  nickname: cookie.getNickname() || '未登录',
  couponCount: cookie.getCouponCount()|| 0
})

// 用户信息
const shop = ref(cookie.getStore() || {shortAddress:'人广来福士店5F-11'})

// 滚动状态
const isScrolled = ref(false)

// 轮播图数据
const bannerList = ref([])

// 三卡片数据与交互
const cards = ref([
	{
		key: 'nature',
		title: '自然之力',
		subtitle: '共鸣平衡',
		desc: '我们使用桧木、玉石和喜马拉雅盐等自然元素，借助其物理特性和能量传递，促进血液循环、调节阴阳平衡，并排出体内毒素',
		color: '#222',
		bg: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/nature-2.jpg',
		minibg:'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/nature-1.jpg',
		detailUrl: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0718/natureDetail.jpg'
	},
	{
		key: 'plant',
		title: '植物芳香',
		subtitle: '唤醒情绪',
		desc: '馥郁的芳香分子通过鼻腔触发嗅觉神经元，信号直达边缘系统，影响杏仁核和海马体，从而快速唤醒情绪反应，调节情绪状态。',
		color: '#5B7B3A',
		bg: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/plant-2.jpg',
		minibg:'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/plant-1.jpg',
		detailUrl: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/content-jingyou.jpg'
	},
	{
		key: 'mindfulness',
		title: '五感与正念',
		subtitle: '专注当下',
		desc: '我们设计的沉浸式场域让客户迅速放松，NSDR音乐和正念引导结合，调节脑电波，帮助客户专注当下，减少杂念，增强身体感知，激活副交感神经，进入休息恢复模式。',
		color: '#E6E1DB',
		bg: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/mindfulness-2.jpg',
		minibg:'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/mindfulness-1.jpg',
		detailUrl: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0718/mindfulnessDetail.jpg'
	}
])

const go_page = (path) => {
	uni.navigateTo({
		url: path
	})
}

const swiperIndex = ref(0)

const handleSwiperChange = (e) => {
	swiperIndex.value = e.detail.current
}

const tabBarList = ref([
	{
		pagePath: '/pages/index/index',
		text: '首页',
		iconPath: '/static/icons/home.png',
		selectedIconPath: '/static/icons/homeHL.png'
	},
	{
			pagePath: '/pages/index/booking',
			text: '预约',
			iconPath: '/static/icons/customer-service.png',
			selectedIconPath: '/static/icons/customer-service.png'
		},
	{
		pagePath: '/pages/user/user',
		text: '我的',
		iconPath: '/static/icons/user.png',
		selectedIconPath: '/static/icons/userHL.png'
	}
]);
const selectedCard = ref(2)
const customBar = ref(0)
const statusBar = ref(0)

function selectCard(idx) {
	if (selectedCard.value === idx) {
		const url = encodeURIComponent(cards.value[idx].detailUrl)
		uni.navigateTo({
			url: '/pages/index/banner-detail?url='+url,
		})
	} else {
		selectedCard.value = idx
	}
}

onLoad((options) => {
  if (options) {
    const {scene} = options
    const token = cookie.getToken()
    // scene值为动态小程序码分享的
    if (scene && token) {
      vm.$Cache.put('activityCode', scene)
      customerApi.saveCustomerTagByActivityCode(scene)
      vm.$Cache.remove('activityCode')
    } else if (scene) {
      vm.$Cache.put('activityCode', scene)
    }
  }

	uni.getSystemInfo({
		success: (e) => {
			// #ifdef MP-WEIXIN
			const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
			customBar.value = custom.bottom + custom.top - e.statusBarHeight
			statusBar.value = e.statusBarHeight + 16
			// #endif
		}
	})
  fetchBannerList()
  cookie.updStoreList()
  if (cookie.getToken()){
    cookie.updIntegration()
    cookie.updCouponCount()
  }
});

onShow(() => {
  updateUser()
})

const updateUser = () => {
  userInfo.value = {
    nickname: cookie.getNickname(),
    couponCount: cookie.getCouponCount()
  }
  shop.value = cookie.getStore()
}

// 分享配置
onShareAppMessage((res) => {
  return {
    title: '邀请好友共同Full愈',
    path: '/pages/index/index',
    imageUrl: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/share-card.jpg'
  }
})

onShareTimeline((res) => {
  return {
    imageUrl: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/share-card.jpg',
    // query: (this.currentUser ? 'invitationCode=' + this.currentUser.invitationCode : ''),
  }
});

const fetchBannerList = async () => {
  bannerList.value = await miniImageApi.bannerList()
}

// 监听页面滚动
onPageScroll((e) => {
  // 当滚动距离大于等于786rpx时，显示背景
  isScrolled.value = e.scrollTop >= 393 // 786rpx转换为px约为393px
})
</script>

<style lang="less" scoped>
.index {
	position: relative;
	.header {
		position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
		transition: background 0.3s ease;
	}
	.header-bg {
		background: url("https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/header-bg.png");
		background-size: cover;
		background-position: bottom center;
		background-repeat: no-repeat;
	}
}
.custom-indicator {
	position: absolute;
	bottom: 36rpx;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	gap: 8rpx;
}

.indicator-dot {
	width: 8rpx;
	height: 8rpx;
	border-radius: 50%;
	background-color: #C5B69D;
	transition: all 0.3s ease;
}

.indicator-dot.active {
	width: 32rpx;
	height: 8rpx;
	border-radius: 4rpx;
	background-color: #584219;
}
</style>
