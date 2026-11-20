<template>
	<view class="min-h-screen index pb-[200rpx]" :class="localeClass()">
		<view class="header px-4 pb-2 flex items-center text-white" :class="{ 'header-bg': swiperIndex }"
			:style="{ paddingTop: statusBar + 'px', height: customBar + 'px' }">
			<!-- <view @click="go_page('/pages/index/shop/shop')" class="flex border flex justify-center items-center "
				style="width: 208rpx;border-radius: 20px;line-height: 30px;padding-left: 5px;border-color: #917A6A;">
				<image v-if="swiperIndex==1"  src="/static/icons/locationhei.png"
					style="width: 18px; height: 14px; " />
				<image v-else  src="/static/icons/location.png" style="width: 18px; height: 14px;" />
				<text @click="openpage" class="truncate">{{shop}}</text>
			</view> -->
			<view @click="go_page('/pages/index/shop/shop')" class="flex   mt-1"
				style="width: 208rpx;padding-left: 5px;border-color: #917A6A;">
				<image v-if="swiperIndex==1" src="/static/icons/locationhei.png"
					style="width: 18px; height: 14px; margin-top: 1px;" />
				<image v-else src="/static/icons/location.png" style="width: 18px; height: 14px;margin-top: 1px;" />
				<text style="line-height: 35rpx;">{{shop}}</text>
			</view>
			<!-- <view @click="go_page('/pages/index/shop/shop')" class="flex" style="width: 208rpx;" :style="{color: swiperIndex==0?'#f2e8cd' : ''}">
				<image v-if="swiperIndex==1"  src="/static/icons/locationhei.png"
					style="width: 18px; height: 14px; margin-top: 3px;" />
				<image v-else class="mr-1" src="/static/icons/location.png"
					style="width: 18px; height: 14px; margin-top: 3px;" />
				<text  >{{ shop }}</text>
			</view> -->
			<image v-if="swiperIndex==1" class="w-[150rpx] h-[100rpx] ml-[10%]" mode="widthFix"
				src="/static/icons/logo.png" />
			<image v-else class="w-[150rpx] h-[100rpx] ml-[10%]" mode="widthFix" src="/static/icons/logobai.png" />

		</view>
		<view class="main overflow-y-auto h-full]" style="position: relative; ">
			<!-- 顶部只留卡券到期提醒；会员续费提醒已移到订单卡叠放区，不再挤压轮播 -->
			<view v-if="couponUnread > 0" class="lang-clearance"></view>
			<!-- 卡券到期提醒：只在确实有提醒时出现 -->
			<view v-if="couponUnread > 0" class="coupon-notice-banner" @click="goCouponNotices">
				<image src="/static/icons/time.png" class="coupon-notice-icon" mode="aspectFit"></image>
				<view class="coupon-notice-main">
					<text class="coupon-notice-title">{{ tt('有 ' + couponUnreadText + t(' 条卡券到期提醒'), couponUnreadText + ' coupons expiring soon') }}</text>
					<text class="coupon-notice-sub">{{ tt('到期前 5 天、3 天提醒，记得安排相愈', 'We remind you 5 and 3 days ahead — plan your visit') }}</text>
				</view>
				<text class="coupon-notice-action">{{ tt('去看看', 'View') }}</text>
			</view>
			<!-- <image src="/static/icons/1/Frame74.png"
				style="width:420rpx;height: 180rpx ;position: absolute;top:360rpx;left:170rpx;"></image> -->

			<!-- 轮播图区域 -->
			<view class="w-full h-[1048rpx]">

				<swiper @change="handleSwiperChange" class="w-full h-[1048rpx]" :indicator-dots="false" :autoplay="true"
					:interval="5000" :duration="500">
					<swiper-item v-for="(item, index) in bannerList" :key="index">
						<view class="w-full h-full relative overflow-hidden">
							<image :src="img(item.url, 750)" :webp="true" class="w-full h-full object-cover"
								mode="aspectFill" />
						</view>
					</swiper-item>
				</swiper>
				<!-- 自定义指示器 -->
				<!-- <view class="custom-indicator">
					<view v-for="(item, index) in bannerList" :key="index"
						class="indicator-dot"
						:class="{ 'active': index === swiperIndex }">
					</view>
				</view> -->
			</view>
			<view class="rectangle"></view>

			<!-- 疗愈订单卡：贴在轮播底部，自身高度决定下方白色面板的位置（不再绝对定位，卡片长高也不会压住面板） -->
			<view v-if="heroOrder" class="w-full px-5 pb-4 order-stack"
				:class="{ 'with-strip': renewStrip.show }"
				style="position: relative; z-index: 98; margin-top: -300rpx;">
				<!-- 续费提醒：压在订单卡后面，露出顶部 116rpx，两行文案 + 续费胶囊 -->
				<view v-if="renewStrip.show" class="renew-strip" @click="renewMemberCard">
					<view class="rb-main">
						<text class="rb-title">{{ renewStrip.lead }}<text class="rb-days">{{ renewStrip.strong }}</text>{{ renewStrip.tail }}</text>
						<text class="rb-sub">{{ renewStrip.sub }}</text>
					</view>
					<view class="rb-btn" @click.stop="renewMemberCard">{{ tt('续费', 'Renew') }}</view>
				</view>
				<view class=" bg-white opacity-90 rounded-2xl text-[#584219] text-[26rpx] "
					style="position: relative; z-index: 2;"
					:class="{ 'order-card-shifted': renewStrip.show }">
					<view class="flex items-center justify-between px-4 py-2 rounded-t-xl  mt-1">
						<view class="flex items-center min-w-0">
							<image src="/static/icons/histrory.png" mode="widthFix" class="w-[30rpx] h-[40rpx]  mr-0.5 flex-shrink-0">
							</image>
							<text class="truncate">{{ heroOrder.title }}</text>
						</view>
						<text class="ml-2 flex-shrink-0">{{t(heroOrder.productTitle)}} <text
								class="font-medium ml-1 ">{{heroOrder.duration}}</text>
							mins </text>
					</view>
					<view class="w-[85%]  rounded-full h-0.5 mb-2 bg-[#E4DCD5]" style="margin-left:7.5% ;"></view>
					<view class="flex items-center px-4 h-[120rpx]">
						<view v-if="heroMassagist" class="flex justify-center flex-shrink-0"
							style="width: 10%;">
							<image :src="img(heroMassagist.avatarUrl, 120)" :webp="true" mode="widthFix"
								style="border-radius: 50%;" class="h-[60rpx] w-[60rpx]"></image>
						</view>
						<view v-if="heroMassagist" class="ml-2 min-w-0" style="width: 45%;">
							<view class="flex items-center gap-2">
								<view class="text-[#1E1E1D] truncate flex-1 min-w-0">{{heroMassagist.name}}
								</view>
								<!-- 疗愈师快捷偏好：图标胶囊，用信息行的竖向余量，不额外占一行 -->
								<view class="hero-pref-row flex-shrink-0">
									<view class="hero-pref-btn"
										:class="{ active: heroMassagist.isFavorited }"
										@click.stop="toggleFavorite(heroMassagist)">
										<image class="hero-pref-icon"
											:src="heroMassagist.isFavorited?'/static/icons/shoucangselect.png':'/static/icons/favorite-therapist.png'"></image>
									</view>
									<view class="hero-pref-btn"
										:class="{ muted: heroMassagist.isBlocked }"
										@click.stop="toggleAvoid(heroMassagist)">
										<image class="hero-pref-icon"
											:src="heroMassagist.isBlocked?'/static/icons/avoid-therapist-check.svg':'/static/icons/avoid-therapist.svg'"></image>
									</view>
								</view>
							</view>
							<view class="text-[#8C8B8A] truncate">{{heroOrder.shopName}}
							</view>
						</view>
						<view v-else class="min-w-0" style="width: 55%">{{heroOrder.shopName}}
						</view>
						<view class="flex items-center justify-end gap-2" style="width: 45%;">
							<text v-if="heroOrder.canReview"
								@click.stop="opertionComment(heroOrder.raw)"
								class="border px-1  rounded-lg  h-[70rpx]  flex items-center justify-center ">
								{{ tt('评价订单', 'Review') }}
								<text style="display: block;position: absolute; margin-top: -35px; border-radius: 10px;margin-left: -15px;
								background-color:#FEE3E3;color:#FA5151  ;font-size: 20rpx;line-height: 10rpx;padding: 6px;">{{ tt('抽积分', 'Points') }}</text>
							</text>
							<view class="px-1 rounded-lg  h-[70rpx]  flex items-center justify-center "
								style="color:#DED9D1;border:1rpx solid #DED9D1 ;"
								v-if="heroOrder.reviewed">
								{{ tt('已评价', 'Reviewed') }}
							</view>
							<text v-if="heroOrder.canView" @click.stop="go_order_detail(heroOrder.raw)"
								class="border px-3 rounded-lg  h-[70rpx]  flex items-center justify-center ">
								{{ tt('订单详情', 'Details') }}</text>
							<text v-if="heroOrder.canRebook"
								@click.stop="go_page_select_project(heroOrder.raw)"
								class="border px-3 rounded-lg  h-[70rpx]  flex items-center justify-center ">
								{{ tt('约TA', 'Book again') }}</text>

							<text @click.stop="handleToPay(heroOrder.raw)" v-if="heroOrder.canPay"
								class="border px-3 bg-[#584219] text-white rounded-lg  h-[70rpx]  flex items-center justify-center "
								>{{ tt('立即支付', 'Pay now') }}
								<text style="display: block;position: absolute; margin-top: -35px; border-radius: 10px;margin-left: -15px;
								background-color:#FEE3E3;color:#FA5151  ;font-size: 20rpx;line-height: 10rpx;padding: 6px;">
									{{ heroOrder.raw.cutDownDes }}
								</text>
							</text>

							<text v-if="heroOrder.canExtend"
								class="border px-6 rounded-lg  h-[70rpx]  flex items-center justify-center "
								@click.stop="AddSercie(heroOrder.raw)">{{ tt('加钟', 'Extend') }}</text>
						</view>
					</view>
				</view>
			</view>

			<!-- 无订单时的续费提醒：白色紧凑卡占住卡片区，左缘金色竖条 -->
			<view v-if="renewStrip.show && !heroOrder" class="renew-slim" @click="renewMemberCard">
				<view class="rs-card">
					<view class="rs-text">
						<text class="rs-saving">{{ renewStrip.slimLead }}<text class="rs-days">{{ renewStrip.slimStrong }}</text>{{ renewStrip.slimTail }}</text>
						<text class="rs-sub">{{ renewStrip.slimSub }}</text>
					</view>
					<view class="rs-btn" @click.stop="renewMemberCard">{{ tt('续费', 'Renew') }}</view>
				</view>
			</view>

			<view class="px-5 pt-2 pb-8"
				:style="heroOrder || renewStrip.show ? 'position: relative;' : 'position: relative; margin-top: -100rpx;'">
				<view class=" bg-white rounded-2xl">
					<!-- 顶部用户栏 -->
					<view class="flex items-center justify-between px-4 py-2 rounded-t-xl bg-[#584219] text-white">
						<text style="white-space: nowrap;overflow: hidden;width: 45%;">
							{{ userInfo.nickname!=null ? tt('尊敬的「'+userInfo.nickname+'」', 'Dear '+userInfo.nickname) : '' }}&nbsp;</text>
						<text class="text-xs text-[#FFFFFFA6]"
							@click="go_page_tabbar('/pages/mall/my-card/my-card')">{{ tt('可享受', 'You have') }}<text
								class="font-medium text-[34rpx] ml-1 text-white">{{ userInfo.couponCount*30 || 0}}</text>
							{{ tt('mins Full愈时刻', 'mins of Fullyu time') }}</text>
					</view>
					<view class="flex justify-center items-center ">
						<view v-if="userLastoneCoupon.data==2||userLastoneCoupon.data==3" class="w-[90%]  mt-3">
							<view class="flex justify-center items-center text-[24rpx] text-[#584219]">
								<view class=" w-[45%] text-left ">{{userLastoneCoupon.couponComment}}</view>
								<view class=" w-[55%] text-right">{{userLastoneCoupon.datetimeStop}}&nbsp;
									{{userLastoneCoupon.couponUserShengYuCount}}
								</view>
							</view>
							<view class="w-full bg-gray-200 rounded-full h-0.5  mt-2">
								<view :style="{width: userLastoneCoupon.percentageStr, backgroundColor: '#584219'}"
									class="h-0.5 rounded-full">
								</view>
							</view>
						</view>
					</view>

					<!-- 功能区块 -->
					<view class="flex justify-around  pb-4 pt-4 items-center"
						:class="{'notLoginCss':(!userInfo.token||userLastoneCoupon.data!=2)}">
						<!-- 预约 -->
						<view @click="go_page('/pages/index/select-project')" class="flex flex-col ">
							<image :src="img('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Frame264.png', 300)"
								:webp="true" class="w-[144rpx] h-[144rpx] mx-auto mb-2" mode="aspectFit" />
							<image :src="img('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Frame90.png', 400)"
								:webp="true" class="w-[290rpx] h-[86rpx]" mode="aspectFit" />
						</view>
						<view style="border-left: 1px solid #5842191A;height: 125rpx;"></view>
						<!-- 送心意 -->
						<view @click="go_page_tabbar('/pages/mall/mall')" class="flex flex-col">
							<image :src="img('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Frame265.png', 300)"
								:webp="true" class="w-[144rpx] h-[144rpx] mx-auto mb-2" mode="aspectFit" />
							<image :src="img('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Frame901.png', 400)"
								:webp="true" class="w-[290rpx] h-[82rpx]" mode="aspectFit" />
						</view>
					</view>
				</view>
				<view v-if="isShow" class="flex justify-center items-center w-full mt-3 text-[#8A6A40]"
					:class="{'notLoginCssSh':(!userInfo.token||userLastoneCoupon.data!=2)}">
					<!-- v-if="" -->
					<text>{{ tt('上滑探索更多精彩', 'Scroll up for more') }}&nbsp; </text>
					<view>
						<image src="/static/icons/chevron-up.png" mode="widthFix" class="h-[24rpx] w-[24rpx]">
						</image>
					</view>
				</view>
			</view>

		</view>
		<!-- 介绍图区块常驻渲染：原先靠 onPageScroll 首次滚动才置 true，页面内容不够高时永远滚不动，整块图文会消失 -->
		<view style="margin-top: -40rpx;">
			<view v-if="bannerListNew.length==0" class="flex justify-center items-center  h-[90rpx]">
				<!-- <image mode="aspectFit" class="w-[480rpx] h-[100rpx]"
					src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/Frame%20280%20%282%29.png">
				</image> -->
				<text
					style="font-size: 32rpx;color: #584219;text-edge: cap;font-style: normal;font-weight: 500;line-height: 135%;">{{ tt('科学放松', 'Relax, Scientifically') }}</text>
			</view>
			<view v-if="bannerListNew.length==0" class="flex justify-center items-center px-5 ">
				<view class="w-1/2 pr-2" @click="selectCard('head')">
					<image class="max-w-full " style="height: 600rpx;max-width:100% ; border-radius: 40rpx;"
						:src="img('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/headnew.jpg', 500)" :webp="true"
						lazy-load></image>
				</view>
				<view class="w-1/2 pl-2" @click="selectCard('body')">
					<image class="max-w-full" style="height: 600rpx;max-width:100% ;border-radius: 40rpx;"
						:src="img('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/bodynew.jpg', 500)" :webp="true"
						lazy-load></image>
				</view>
			</view>
			<view class="flex justify-center items-center h-[90rpx]">
				<!-- <image mode="aspectFit" class="w-[480rpx] h-[100rpx]"
					src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/Frame5.png"></image> -->
				<text
					style="font-size: 32rpx;color: #584219;text-edge: cap;font-style: normal;font-weight: 500;line-height: 135%;">{{ tt('科学放松', 'Relax, Scientifically') }}</text>
			</view>
			<view class="flex justify-center items-center px-5  " @click="go_page_notbutton('nature-detail')">
				<image style="width: 100%;"
					:src="img('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/frame6.png', 750)" :webp="true"
					lazy-load></image>
			</view>
			<view style="height: 80rpx;"></view>
		</view>
		<!-- 智能预约悬浮图标：按要求隐藏，需要恢复时取消注释即可 -->
		<!-- <AiButton :yluxin="aiheightvalue"></AiButton> -->
		<!-- 语言切换只放首页：悬浮在胶囊下方，其它页面不放入口 -->
		<LangSwitch />
		<CustomTabBar :selected="0" :list="tabBarList" />

		<!-- 评价弹框组件 -->
		<CommentFisrtModel :visible="showCommentModal" ref="refCommentFisrtModel" :order="currentCommentRecord"
			:therapists="commentTherapists"
			:orderId="String(currentCommentRecord?.id || '')" :showLotteryAfterSubmit="true" @cancel="hideCommentModal"
			@submit="handleCommentSubmit" />

		<!-- 加钟 -->
		<AddService ref="refAddService" :visible="showAddServiceModel" :order="orderInfo" @cancel="hideAddServiceModal"
			@submit="handleAddServiceSubmit" />
		<!-- 预约 -->
		<!-- <AddServiceAll v-if="true" ref="refAddServiceAll" :visible="showAddServiceAllModal" :orderId="orderId"
			:showLotteryAfterSubmit="true" @cancel="handleCancel" @submit="handleEvaluationSubmit" /> -->

		<!-- 支付 -->
		<!-- key 会在连续支付切换订单时自增：换单必须重建弹框，否则会带着上一单的优惠方案/卡券去付新单 -->
		<PayModelPage :key="payModalKey" :visible="showPaymentModal" :countdown="countdown" ref="payModelPageRef"
			@confirm="handlePaymentConfirm" @cancel="handlePaymentCancel" />

		<!-- uni-popup 组件 -->
		<uni-popup ref="agreedPopup" mode="center" style="z-index: 9999;" :maskClick="false" :disable-scroll="true">
			<view class="w-full flex justify-center items-center" @click="go_any_page(popupImageGoPath)">
				<image :src="img(popupImage, 600)" :webp="true" style="width: 600rpx;height: 800rpx;border-radius: 15rpx;"></image>
			</view>
			<view class="w-full flex justify-center items-center mt-6">
				<image @click="closeUniPopup" src="/static/icons/circle-x.png" style="width: 80rpx;height: 80rpx;">
				</image>
			</view>
		</uni-popup>
	</view>
</template>



<script setup>
	import { t } from '../../utils/locale'
	import { img } from '../../utils/imageLocale'
	import CustomTabBar from '../../components/CustomTabBar.vue';
	import AiButton from '../../components/AiButton.vue';
	import LangSwitch from '../../components/LangSwitch.vue';
	import { useLocale } from '../../utils/locale'
	import AddService from '../../components/AddService.vue';
	import AddServiceAll from '../../components/AddServiceAll.vue';
	import CommentFisrtModel from '../../components/CommentFisrtModel.vue';
	import miniImageApi from "../../api/miniImage"
	import orderApi from "../../api/order"
	import cookie, {
		getCouponCount
	} from "../../utils/cookieUtil"
	import customerApi from '../../api/customer'
	import PayModelPage from '../../components/PayModelPage.vue';
	import UniPopup from "../../uni_modules/uni-popup/components/uni-popup/uni-popup.vue";
	import customerCouponApi from '../../api/customerCoupon'
	import productApi from "../../api/product";
	import massagistRateApi from "../../api/MassagistRate";
	import { loadYearCardSummary, formatYuan } from "../../api/brandMember";
	import customerMassagistRelationApi from '../../api/customerMassagistRelation'
	import customerMassagistBlockApi from '../../api/customerMassagistBlock'
	import customerNoticeApi from '../../api/customerNotice'
	import { applyUnpaidCountdowns, buildUnpaidQueue, tickUnpaidCountdowns, unpaidSecondsLeft } from '../../utils/unpaidOrders'
	import { storeName, storeShortAddress } from '../../utils/storeLocale'
	import constant from '@/consts/constant'
	import {
		onLoad,
		onShareAppMessage,
		onShareTimeline,
		onShow,
		onPageScroll
	} from "@dcloudio/uni-app"
	import {
		ref,
		computed,
		nextTick,
		onBeforeUnmount,
		onMounted,
		reactive,
		getCurrentInstance
	} from 'vue'
	// 首页文案双语：tt(中文, 英文)，语言状态由 utils/locale 统一维护
	const { tt } = useLocale()
	const agreedPopup = ref(null)

	//广告弹出层
	const popupImage = ref('')
	const popupImageGoPath = ref('')
	const showPopup = async () => {

		const resData = await miniImageApi.popupImageList()
		console.log("resData")
		console.log(resData)
		if (resData != null && resData.length > 0) {
			popupImage.value = resData[0].url
			popupImageGoPath.value = resData[0].goUrl
			agreedPopup.value.open('center')
		}
	} //广告关闭
	const closeUniPopup = () => {
		getApp().globalData.indexBanner = 1
		agreedPopup.value.close()
	}
	// 支付弹框显示状态
	const showPaymentModal = ref(false);
	// 支付弹框实例 key：连续支付切换到下一笔未付单时自增，强制重建弹框内部的选券/选卡状态
	const payModalKey = ref(0);
	//加钟弹出框初始值
	const showAddServiceModal = ref(false);
	//评价弹出框初始值
	let showCommoneModal = ref(false)
	//预约弹出框初始值
	const showAddServiceAllModal = ref(false);
	let countdown = ref(0);
	const {
		proxy
	} = getCurrentInstance()
	const vm = proxy

	/* 评价模块 */
	let therapistsObject = ref([{
		avatar: '',
		name: "卢新",
		rating: 3
	}])
	let orderId = ref(1)


	const openShowCommoneModal = () => {
		console.log(therapistsObject)
		showCommoneModal.value = true; //评价弹出框
	}
	/* const openPayModelPage = () => {
		showPaymentModal.value = true; //支付弹出框弹出
	} */
	const openShowAddServiceAllModal = () => {
		showAddServiceAllModal.value = true //预约弹出框
	}
	const openShowAddServiceModal = () => {
		showAddServiceModal.value = true //加钟
	}



	// 用户信息
	const userInfo = ref({
		nickname: cookie.getNickname() || tt('未登录', 'Guest'),
		couponCount: cookie.getCouponCount() || 0
	})

	// 用户信息
	// 首页头部的门店简址：中文/英文由后台填的门店字段决定，切语言时 label 要立刻刷新，
	// 所以这里存门店对象、展示值用 computed，而不是在 refreshShopLabel 里算成死字符串
	const nearestShop = ref(null)
	const shop = computed(() => nearestShop.value
		? storeShortAddress(nearestShop.value)
		: tt('人广来福士店5F-11', 'Raffles City 5F-11'))

	// 滚动状态
	const isScrolled = ref(false)
	const handleFcroll = () => {
		console.log("-----")
	}

	// 轮播图数据
	const bannerList = ref([])

	const go_page = (path) => {
		uni.navigateTo({
			url: path
		})
	}
	const go_page_tabbar = (path) => {
		if (!cookie.getToken() && path == '/pages/mall/my-card/my-card') {
			uni.showToast({
				title: tt('暂未登录', 'Please log in'),
				icon: 'none'
			});
			setTimeout(() => {
				uni.navigateTo({
					url: '/pages/login/login',
				})
			}, 500)
			return false
		} else {
			uni.switchTab({
				url: path
			})
		}
	}
	const go_page_notbutton = (path) => {
		console.log(path)
		uni.navigateTo({
			url: path
		});
	}

	const swiperIndex = ref(0)

	const handleSwiperChange = (e) => {
		//swiperIndex.value = e.detail.current
	}

	const tabBarList = ref([{
			pagePath: '/pages/index/index',
			text: '首页',

		},
		{
			pagePath: '/pages/mall/mall',
			text: '商城',

		},
		{
			pagePath: '/pages/index/select-project',
			iconPath: '/static/icons/reservation.svg',
			text: '预约',

		},
		{
			pagePath: '/pages/user/order/order',
			text: '订单',

		},
		{
			pagePath: '/pages/user/index',
			text: '我的',

		}

	]);
	const selectedCard = ref(2)
	const customBar = ref(0)
	const statusBar = ref(0)
	const isShow = ref(true)
	const bannerImageStr = ref('')

	function selectCard(idx) {
		uni.navigateTo({
			url: '/pages/index/banner-detail?keyl=' + idx,
		})
	}
	const aiheightvalue = ref(0)
	onLoad((options) => {
		if (options) {
			const {
				scene
			} = options
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
				if (e.screenHeight < 750) {
					aiheightvalue.value = 550
				} else {
					aiheightvalue.value = 640
				}
				// #endif
			}
		})
		fetchBannerList()
		if (cookie.getToken()) {
			cookie.updIntegration()
			cookie.updCouponCount()
			//获取用户第一个未失效的卡劵信息
			getUserLastoneCoupon()

		}

		
	});
	onMounted(() => {
		if (getApp().globalData.indexBanner == 0) {
			showPopup()
		}
		prefetchNextPages()
	})

	// 首屏渲染完再预下载下一跳页面，用户点「预约 / 商城 / 我的」时可直接出界面
	const prefetchNextPages = () => {
		// #ifdef MP-WEIXIN
		setTimeout(() => {
			['/pages/index/booking', '/pages/mall/mall', '/pages/user/index'].forEach((url) => {
				try {
					uni.preloadPage({ url })
				} catch (error) {
					// 低版本基础库不支持 preloadPage，忽略即可
				}
			})
		}, 2000)
		// #endif
	}
	const shoplist=ref(null)
	const bannerListNew=ref([])
	// 首页门店展示与预约口径一致：按定位取最近门店，不再沿用上一单门店
	const refreshShopLabel = () => {
		shoplist.value = cookie.getStoreList()
		nearestShop.value = cookie.getStore()
	}
	const locationWZ = async () => {
		uni.getSetting({
			success(res) {
				if (!res.authSetting['scope.userLocation']) {
					cookie.updStoreList(0, 0)
					refreshShopLabel()
				} else {
					uni.getLocation({
						type: 'wgs84', // 坐标系类型
						altitude: true, // 是否获取高度
						success: async (res) => {
							console.log('位置信息：', {
								latitude: res.latitude, // 纬度
								longitude: res.longitude, // 经度
								accuracy: res.accuracy, // 位置精度（米）
								altitude: res.altitude // 高度（米）
							});
							await cookie.updStoreList(res.latitude, res.longitude)
							refreshShopLabel()
						}
					});
				}
			}
		});
	}
	// 模板始终按对象读取（userLastoneCoupon.data），接口异常时也必须保持对象，否则整页渲染报错。
	const userLastoneCoupon = ref({})
	// 会员续费提醒（首页口径：7 天内到期或已到期）
	// 服务端 EXPIRING 仍是 30 天口径，「我的 / 卡包」按 30 天显示，这里只在 ≤7 天时才提醒。
	// 已排期续费（pendingStart）不再提醒，避免重复引导。
	const memberInfo = ref({})
	const renewStrip = computed(() => {
		const data = memberInfo.value || {}
		if (data.pending) return { show: false }
		const expired = data.state === 'expired'
		const days = Number(data.remainingDays)
		if (!expired) {
			if (data.state !== 'expiring') return { show: false }
			// 负数留给服务端翻成「已到期」，页面不显示「还有 -1 天」。
			if (!Number.isFinite(days) || days < 0 || days > 7) return { show: false }
		}
		const product = data.product || {}
		const span = Number(product.validDays) || 0
		// 英文需要在卡名后留空格，中文原样返回。
		const cardName = (data.current && data.current.cardName) || tt('Full愈大会员', 'Full Yu Member')
		const nameLead = tt(cardName, cardName + ' ')
		const savedText = Number(data.savedCents) > 0 ? '¥' + formatYuan(data.savedCents) : ''
		const daysText = tt(days + ' 天', days + (days === 1 ? ' day' : ' days'))
		const spanText = span > 0 ? tt('顺延 ' + span + ' 天', 'adds ' + span + ' days') : tt('从当前有效期结束日起算', 'starts when the current term ends')
		return {
			show: true,
			expired,
			lead: expired ? nameLead : tt('会员还有 ', 'Membership ends in '),
			strong: expired ? tt('已到期', 'expired') : daysText,
			tail: expired ? '' : t('到期'),
			// 有卡期就用卡期说顺延，没有就只说到期日，不写死 365。
			sub: expired
				? tt('续费后恢复三店会员价', 'Renew to restore member pricing')
				: tt('续费后' + spanText, 'Renewal ' + spanText),
			// 独立卡：有真实「本年已省」就先报账，没有就回到到期日，不编数字。
			slimLead: savedText ? tt('过去已为你省下 ', 'Saved with your membership: ') : (expired ? nameLead : tt('会员还有 ', 'Membership ends in ')),
			slimStrong: savedText || (expired ? tt('已到期', 'expired') : daysText),
			slimTail: savedText || expired ? '' : t('到期'),
			slimSub: expired
				? tt('会员已到期，续费后恢复三店会员价', 'Expired — renew to restore member pricing')
				: tt('会员还有 ' + days + ' 天到期，续费' + spanText, 'Ends in ' + days + ' days — renewal ' + spanText)
		}
	})
	const loadMemberCard = async () => {
		// 与「我的」页、卡包同源：只读 CRM 品牌会员，不再有第二种卡。
		memberInfo.value = (await loadYearCardSummary()) || {}
	}
	const renewMemberCard = () => {
		if (!cookie.getToken()) {
			// 未登录直接去登录页：不在首页弹提示再跳，登录返回后横幅会重新取会员身份。
			uni.navigateTo({ url: '/pages/login/login' })
			return
		}
		// 续办只能发生在会员页：报价、支付、开卡都在那一条链路上完成，
		// 首页这里不再自己调旧卡购买接口（那会写出两套卡）。
		uni.navigateTo({ url: '/pages/user/brand-member/brand-member?renew=1' })
	}
	onShow(() => {
		updateUser()
		// 每次回到首页都重新以服务端为准，清掉上一轮连续支付留下的已付标记
		paidOrderIds.value = []
		if (cookie.getToken() != null && cookie.getToken() != '') {
			//获取用户第一个未失效的卡劵信息
			getUserLastoneCoupon()
			//加载最后一个订单信息
			getLastOrderInfo()
			//会员卡到期提醒
			loadMemberCard()
			//卡券到期提醒（无提醒时首页不显示）
			loadCouponUnread()
		} else {
			userLastoneCoupon.value = {}
			lastOrderInfo.value = []
			lastOrderShopInfo.value = []
			memberInfo.value = {}
			couponUnread.value = 0
		}
		//根据位置获取最近的店铺列表
		locationWZ()
	})
	//去支付按钮
	const payModelPageRef = ref(null)
	// 连续支付排队中的续付定时器：用户自己又付了一次时要能作废
	let payChainTimer = null
	const handleToPay = async (record) => {
		// 和卡片上的倒计时同源：优先用订单自己的支付超时秒数，没有则用兜底值
		countdown.value = unpaidSecondsLeft(record, constant.payCutDownSeconds)
		if (countdown.value <= 0) {
			// 倒计时已结束：订单已被自动取消，刷新卡片让状态回到正确档位
			countdown.value = 0
			getLastOrderInfo()
			uni.showToast({
				title: tt('订单已超时取消，请重新预约', 'This order expired, please rebook'),
				icon: 'none'
			})
			return
		}
		// 先把结算数据取回来再开弹窗：原来的实现是先弹窗后拉数据，
		// 弹窗会先用上一单的价格/券数渲染，用户可能对着旧金额直接点"确认支付"
		// 连续支付换单时弹框会被重建，这里等一帧确保 ref 已经指到新实例
		await nextTick()
		if (payModelPageRef.value && payModelPageRef.value.fetchData) {
			try {
				await payModelPageRef.value.fetchData(record.id)
			} catch (e) {
				return
			}
		}
		showPaymentModal.value = true; //支付弹出框弹出
	}
	const handlePaymentConfirm = async (paymentData) => {
		showPaymentModal.value = false;
		// 上一笔排队的续付作废：用户可能自己又点了一次支付并已经付掉了，别再拉一次
		clearTimeout(payChainTimer)
		cookie.updCouponCount()
		cookie.updIntegration()
		getUserLastoneCoupon()
		if (paymentData == 'notpay') {
			// 用户取消/支付失败：订单还在，卡片继续显示倒计时，可以再点一次立即支付
			await getLastOrderInfo()
			uni.showToast({
				title: tt('未完成支付，可继续支付', 'Payment not finished'),
				icon: "none",
				duration: 2500
			});
			return
		}
		// 记下已付的单：支付回执异步落库期间，接口可能还把这一单当未付返回
		paidOrderIds.value = [...paidOrderIds.value, String(paymentData)]
		await getLastOrderInfo()
		// 连续支付：同一时间窗里可能还有别的未付单，付完一笔先把下一笔的支付弹框顶上，
		// 否则用户要反复回卡片点按钮，慢一点就整单超时被取消
		const nextOrder = unpaidQueue.value[0]
		if (nextOrder) {
			uni.showToast({
				title: tt('支付成功，继续支付下一笔（还有 ' + unpaidQueue.value.length + ' 笔）',
					'Paid — ' + unpaidQueue.value.length + ' more to go'),
				icon: "none",
				duration: 1500
			});
			payModalKey.value += 1
			payChainTimer = setTimeout(() => {
				// 排队期间这一单可能已经被付掉/超时，开弹框前再确认一次
				const stillPending = unpaidQueue.value.some(o => String(o.id) === String(nextOrder.id))
				if (stillPending) {
					handleToPay(nextOrder)
				}
			}, 1000)
			return
		}
		// 支付成功后首页只做状态刷新，细节（门店地址、到店时间、分享）交给预约成功页承接
		uni.showToast({
			title: tt('支付成功', 'Paid'),
			icon: "none",
			duration: 1200
		});
		setTimeout(() => {
			uni.navigateTo({
				url: '/pages/index/pay-success/appointment-success?topdisplayStatus=false&orderId=' + paymentData
			})
		}, 600)
	}
	const handlePaymentCancel = () => {
		showPaymentModal.value = false;
		//getLastOrderInfo()
	}

	const go_order_detail = (record) => {
		uni.navigateTo({
			url: '/pages/user/order/order-detail?id=' + record.id
		})
	}
	//再次预约
	const go_page_select_project = (record) => {
		const detail = (record.orderDetailList || [])[0]
		if (!detail) {
			uni.showToast({
				title: tt('订单信息不完整，请到订单列表重试', 'Order info incomplete'),
				icon: 'none'
			})
			return
		}
		const massagist = detail.massagist
		if (massagist) {
			uni.navigateTo({
				url: '/pages/index/select-project?projectId=' + detail.projectId +
					'&projectMinute=' + detail.duration + '&massagistName=' + massagist.name +
					'&massagistId=' + massagist.id + '&shopId=' + massagist.shopId
			})
		} else {
			uni.navigateTo({
				url: '/pages/index/select-project?projectId=' + detail.projectId +
					'&projectMinute=' + detail.duration + '&shopId=' + record.shopId
			})
		}
	}
	//加钟模块
	const showAddServiceModel = ref(false)
	const orderInfo = ref([])
	const AddSercie = (record) => {
		orderInfo.value = record
		showAddServiceModel.value = true
	}
	//隐藏加钟
	const hideAddServiceModal = () => {
		showAddServiceModel.value = false
	}
	//处理加钟
	const handleAddServiceSubmit = async (serviceData) => {
		uni.showLoading({
			title: tt('处理中', 'Processing'),
			mask: true,
		})
		console.log("serviceData")
		console.log(serviceData)
		let orderId = ''
		try {
			let parmsProject = serviceData.yinxiangone
			let project = 0
			if (parmsProject == 0) {
				project = 2
			}
			if (parmsProject == 1) {
				project = 1
			}
			if (parmsProject == 2) {
				project = 4
			}
			////根据选择的项目获取产品Id
			let productList = await productApi.productlist()
			let product = productList.filter(t => {
				return t.content[0].projectId == project
			});
			let productId = 0
			if (product.length > 0) {
				productId = product[0].id
			} else {
				uni.showToast({
					title: tt('未找到对应的产品！', 'Service not found'),
					icon: 'none'
				})
				return
			}
			let isUpdateSort = true
			if (serviceData.order.orderDetailList[0].massagist) {
				isUpdateSort = false
			}
			const comment = cookie.getComment()
			const gender = cookie.getGender()
			const phone = cookie.getPhone()
			const formData = {
				personCount: 1, // 更新：在表单数据中添加人数
				productId: productId,
				durationMinutes: serviceData.duration,
				startTime: serviceData.order.endTime,
				shopId: serviceData.order.shopId,
				isUpdateSort: isUpdateSort, //分配技师后，标志技师进入排序   false 为不进如排序
				addType: 1, //1标识加钟：加钟单不再是新的一轮轮牌，优先安排原单疗愈师
				fromOrderId: serviceData.order.id, //加钟来源订单id
				bedIdList: [serviceData.order.orderDetailList[0].bedId],
				gender: gender,
				comment: comment,
				phone: phone,
				date: serviceData.order.endTime,
				massagistIdList: serviceData.order.orderDetailList[0].massagist ? [serviceData.order
					.orderDetailList[0].massagistId
				] : []
			};
			console.log('加钟信息:', formData);
			orderId = await orderApi.createOrder({
				...formData,
				appointmentType: 2
			}) || ''
		} catch (e) {
			// 建单失败（原单状态异常 / 时段被占 / 网络）由 fetch 拦截器提示，这里只保证遮罩一定收起
			return
		} finally {
			uni.hideLoading()
		}

		console.log(orderId)
		hideAddServiceModal() //隐藏加钟框
		orderInfo.value = await orderApi.infoWithDetail(orderId)
		// 加钟单一旦落单，首页订单卡立刻以服务端为准重拉：原来只有「走支付弹框并付成功」这一条路会刷新，
		// 已结清 / 已取消 / 超时 / 用户关掉支付弹框这几种情况卡片都会停在加钟前的那一单，只能手动刷新首页才对
		getLastOrderInfo()
		if (!orderInfo.value) {
			uni.showToast({
				title: tt('订单不存在', 'Order not found'),
				icon: 'none'
			});
		} else if (orderInfo.value.state == 1 || orderInfo.value.state == 2) {
			uni.showToast({
				title: tt('订单已支付', 'Order already paid'),
				icon: 'none'
			});
		} else if (orderInfo.value.state == 3 || orderInfo.value.state == 4) {
			uni.showToast({
				title: tt('订单已取消', 'Order cancelled'),
				icon: 'none'
			});
		} else if (orderInfo.value.state == 5 || orderInfo.value.state == 6) {
			uni.showToast({
				title: tt('订单已退款', 'Order refunded'),
				icon: 'none'
			});
		} else {
			const createTime = Date.parse(orderInfo.value.createTime) / 1000
			const currentTime = Date.parse(new Date()) / 1000
			countdown.value = constant.payCutDownSeconds - (currentTime - createTime);
			console.log(createTime)
			console.log(currentTime)
			console.log(countdown.value)
			console.log(constant.payCutDownSeconds)
			if (countdown.value > 0) {
				// 和「立即支付」同一条规矩：先把这张加钟单的结算数据取回来再弹窗，
				// 否则弹框会先拿上一单的金额/券数渲染，用户对着旧金额就能点确认
				await nextTick()
				if (payModelPageRef.value && payModelPageRef.value.fetchData) {
					try {
						await payModelPageRef.value.fetchData(orderId)
					} catch (e) {
						return
					}
				}
				showPaymentModal.value = true; //支付弹出框弹出
			} else {
				countdown.value = 0
				uni.showToast({
					title: tt('订单已取消', 'Order cancelled'),
					icon: 'none'
				});
			}
		}
	}


	//评价模块
	const showCommentModal = ref(false)
	const currentCommentRecord = ref(null)
	const refCommentFisrtModel = ref(null)
	// 评价弹框只吃有疗愈师的明细：orderDetailList 里可能有没有排疗愈师的明细，直接传会在组件里取 id 报错
	const commentTherapists = computed(() => {
		const details = (currentCommentRecord.value && currentCommentRecord.value.orderDetailList) || []
		return details.map(s => s.massagist).filter(Boolean)
	})
	const opertionComment = (record) => {
		currentCommentRecord.value = record
		showCommentModal.value = true
	}
	// 隐藏评价弹框
	const hideCommentModal = () => {
		showCommentModal.value = false
	}
	//平均提交模块
	const handleCommentSubmit = async (evaluationData) => {
		try {
			await massagistRateApi.createBatch(evaluationData)
		} catch (e) {
			// 失败时保持弹框打开，用户可以补评分再提交，不许假装成功
			if (refCommentFisrtModel.value && refCommentFisrtModel.value.cancelSubmitting) {
				refCommentFisrtModel.value.cancelSubmitting()
			}
			uni.showToast({
				title: tt('评价提交失败，请重试', 'Review failed, please retry'),
				icon: 'none'
			})
			return
		}
		// 成功后由弹框统一收口：成功提示 + 关闭 + 抽奖入口
		getLastOrderInfo()
		hideCommentModal()
		if (refCommentFisrtModel.value && refCommentFisrtModel.value.confirmSubmitted) {
			refCommentFisrtModel.value.confirmSubmitted(evaluationData.orderId)
		}
	}


	//获取最后一个订单
	const lastOrderInfo = ref([])
	const lastOrderShopInfo = ref([])
	// 首页订单卡只展示最近一单，但服务端把它拆成 state（支付/服务进度）和 appointmentState（预约进度）两个字段，
	// 直接写在模板里很容易出现「已支付还提示未支付」这类矛盾文案，这里统一收敛成一个视图模型，模板只负责展示。
	// 待支付队列：同一用户可能同时挂着几笔未付单（各自独立倒计时、超时自动取消），
	// 按创建时间从早到晚排，先付最先超时的那笔，付完一笔再付下一笔。
	// 微信支付回执是异步落到服务端的，刚付完的那笔可能还带着 state=0 回来，这里按本次已付的 id 过滤掉，避免重复拉起支付。
	const paidOrderIds = ref([])
	const unpaidQueue = computed(() => buildUnpaidQueue(lastOrderInfo.value, paidOrderIds.value))
	// 有待支付订单时卡片优先让给它们，否则用户看不到入口，只能等订单被自动取消
	const heroRaw = computed(() => unpaidQueue.value[0] ||
		lastOrderInfo.value.find(o => !paidOrderIds.value.includes(String(o.id))) || null)
	const heroOrder = computed(() => {
		const raw = heroRaw.value
		if (!raw) return null
		const state = Number(raw.state)
		const appointmentState = Number(raw.appointmentState)
		const detail = (raw.orderDetailList || [])[0] || {}
		const unpaid = state === 0
		// 倒计时归零的未支付单：在接口刷新回来之前先按「已超时」展示，避免留下一个点不动的支付按钮
		const expired = unpaid && !(Number(raw.cutdown) > 0)
		let title = tt('您的上次预约', 'Your last visit')
		if (expired) {
			title = tt('预约已超时，请重新预约', 'This booking expired')
		} else if (unpaid) {
			title = tt('订单待支付，超时自动取消', 'Awaiting payment')
		} else if (appointmentState === 1) {
			title = tt('有一个订单正在进行中', 'A session is in progress')
		} else if (state === 1 && appointmentState === 2) {
			title = tt('服务已完成，评价可得积分', 'Session done — review to earn points')
		} else if (state === 2 && appointmentState === 2) {
			title = tt('谢谢你的评价', 'Thanks for your review')
		} else if (state === 1) {
			title = tt('预约成功，等你到店', 'Booked — see you soon')
		} else if (state === 3) {
			title = tt('本次预约已关闭', 'This booking is closed')
		}
		return {
			raw,
			title,
			productTitle: raw.productTitle || detail.productTitle || '',
			duration: raw.duration || detail.duration || '',
			shopName: lastOrderShopInfo.value.length > 0 ? storeName(lastOrderShopInfo.value[0]) : '',
			canPay: unpaid && !expired,
			canExtend: state === 1 && appointmentState === 1,
			// 已支付、还没到服务时间：卡片上给个详情入口，否则只能去订单列表翻
			canView: state === 1 && appointmentState === 0,
			canReview: state === 1 && appointmentState === 2,
			reviewed: state === 2 && appointmentState === 2,
			canRebook: state === 3 || appointmentState === 2 || expired
		}
	})
	const heroMassagist = computed(() => {
		const raw = heroRaw.value
		if (!raw) return null
		const detail = (raw.orderDetailList || [])[0]
		return (detail && detail.massagist) || null
	})
	//卡券到期未读提醒数：为 0 时首页不出现提醒框
	const couponUnread = ref(0)
	// 提醒条上的数字文案：超过 99 显示 99+
	const couponUnreadText = computed(() => (couponUnread.value > 99 ? '99+' : String(couponUnread.value)))
	const loadCouponUnread = async () => {
		try {
			const count = await customerNoticeApi.unread()
			couponUnread.value = Number(count) || 0
		} catch (e) {
			couponUnread.value = 0
		}
	}
	const goCouponNotices = () => {
		//标记一次性意图，券包页据此直接展开提醒列表
		uni.setStorageSync('couponNoticeExpand', 1)
		uni.switchTab({
			url: '/pages/mall/my-card/my-card'
		})
	}
	const getLastOrderInfo = async () => {
		let list = await orderApi.getLastOrderInfo()
		applyUnpaidCountdowns(list, constant.payCutDownSeconds)
		list.forEach(o => {
			if (Number(o.state) === 0 && Number(o.cutdown) > 0) {
				o.cutDownDes = getCutDown(o)
			}
		})
		startCountdown()
		lastOrderInfo.value = list
		await loadMassagistPreferences()
		// 门店名要跟着卡片实际展示的那一单走（未付单可能不是最新的一单）
		const heroShopId = heroRaw.value ? heroRaw.value.shopId : null
		if (heroShopId) {
			let listShop = cookie.getStoreList()
			lastOrderShopInfo.value = listShop.filter(t => {
				return t.id == heroShopId
			})
		} else {
			lastOrderShopInfo.value = []
		}
	}
	//首页订单卡内快捷收藏/暂别：一次性加载关系与暂别名单
	const loadMassagistPreferences = async () => {
		try {
			const [relationData, blockPage] = await Promise.all([
				customerMassagistRelationApi.getList(),
				customerMassagistBlockApi.getPage({ page: 1, size: 300 })
			])
			const relations = relationData || []
			const blocks = (blockPage && blockPage.list) || []
			lastOrderInfo.value.forEach(record => {
				(record.orderDetailList || []).forEach(detail => {
					const massagist = detail.massagist
					if (!massagist) return
					const relation = relations.find(s => s.massagistId == massagist.id)
					massagist.isFavorited = !!relation
					massagist.relationId = relation ? relation.id : null
					const block = blocks.find(s => s.massagistId == massagist.id)
					massagist.isBlocked = !!block
					massagist.blockId = block ? block.id : null
				})
			})
		} catch (e) {
			//偏好加载失败不影响首页订单卡展示
		}
	}
	const toggleFavorite = async (massagist) => {
		if (!massagist) return
		if (massagist.isFavorited) {
			const res = await new Promise((resolve) => {
				uni.showModal({
					title: tt('提示', 'Notice'),
					content: tt('确定要取消收藏吗？', 'Remove this therapist from your favorites?'),
					confirmText: tt('确定', 'Confirm'),
					cancelText: tt('取消', 'Cancel'),
					success: resolve
				})
			})
			if (!res.confirm) return
			await customerMassagistRelationApi.remove(massagist.relationId)
			uni.showToast({
				title: tt('已取消收藏', 'Removed from favorites'),
				icon: 'none'
			})
			await loadMassagistPreferences()
			return
		}
		const wasBlocked = !!massagist.isBlocked
		await customerMassagistRelationApi.createRelation(massagist.id)
		// 收藏会顺带解除暂别，两条提示合并成一条，避免第二条被小程序吞掉
		uni.showToast({
			title: wasBlocked
				? tt('已收藏，并解除暂别', 'Favorited — pause removed')
				: tt('收藏成功', 'Added to favorites'),
			icon: wasBlocked ? 'none' : 'success'
		})
		await loadMassagistPreferences()
	}
	const toggleAvoid = async (massagist) => {
		if (!massagist) return
		if (massagist.isBlocked) {
			await customerMassagistBlockApi.remove(massagist.blockId)
			uni.showToast({
				title: tt('已恢复，可以正常预约 TA 了', 'Resumed — you can book this therapist again'),
				icon: 'none'
			})
			await loadMassagistPreferences()
			return
		}
		const res = await new Promise((resolve) => {
			uni.showModal({
				title: tt('暂时不约 TA？', 'Pause this therapist?'),
				content: tt(`之后预约时会自动避开「${massagist.name}」，TA 不会收到任何通知，随时可以恢复。`,
					`Future bookings will automatically skip ${massagist.name}. They will not be notified, and you can resume anytime.`),
				confirmText: tt('暂时不约', 'Pause'),
				cancelText: tt('再想想', 'Not now'),
				confirmColor: '#7A736B',
				success: resolve
			})
		})
		if (!res.confirm) return
		const wasFavorited = !!massagist.isFavorited
		await customerMassagistBlockApi.createRelation(massagist.id)
		uni.showToast({
			title: wasFavorited
				? tt('已暂别，并取消收藏', 'Paused — also unfavorited')
				: tt('已设为暂别，之后自动避开 TA', 'Paused — future bookings will skip this therapist'),
			icon: 'none'
		})
		await loadMassagistPreferences()
	}
	let cutDownTimer = null;
	const startCountdown = () => {
		if (cutDownTimer) clearInterval(cutDownTimer);
		cutDownTimer = setInterval(() => {
			// 未付单的倒计时推进与到期标记统一走 utils，页面这里只管文案和刷新
			const expiredOne = tickUnpaidCountdowns(lastOrderInfo.value)
			lastOrderInfo.value.forEach(o => {
				if (Number(o.state) === 0 && Number(o.cutdown) > 0) {
					o.cutDownDes = getCutDown(o)
				}
			})
			// 多笔未付单同时到期时只刷新一次，避免一秒内并发拉多次订单
			if (expiredOne) {
				getLastOrderInfo()
			}
		}, 1000);
	};
	const getCutDown = (item) => {
		const seconds = Math.max(0, Math.floor(Number(item.cutdown) || 0));
		let hours = Math.floor(seconds / 3600);
		let min = Math.floor((seconds % 3600) / 60);
		let second = seconds % 60;

		hours = hours < 10 ? '0' + hours : hours;
		min = min < 10 ? '0' + min : min;
		second = second < 10 ? '0' + second : second;

		return tt('倒计时：', 'Time left: ') + hours + ':' + min + ':' + second;
	}

	//获取用户第一个未失效的卡劵信息
	const getUserLastoneCoupon = async () => {
		try {
			const info = await customerCouponApi.getUserLastoneCoupon()
			userLastoneCoupon.value = info && typeof info === 'object' ? info : {}
		} catch (e) {
			userLastoneCoupon.value = {}
		}
	}
	const updateUser = async () => {
		userInfo.value = {
			nickname: cookie.getNickname(),
			couponCount: cookie.getCouponCount(),
			token: cookie.getToken()
		}
		


	}

	// 分享配置
	onShareAppMessage((res) => {
		return {
			title: t('邀请好友共同Full愈'),
			path: '/pages/index/index',
			imageUrl: constant.shareCardImage
		}
	})

	onShareTimeline((res) => {
		return {
			imageUrl: constant.shareCardImage,
			// query: (this.currentUser ? 'invitationCode=' + this.currentUser.invitationCode : ''),
		}
	});
	
	const fetchBannerList = async () => {
		bannerList.value = await miniImageApi.bannerList()
		bannerImageStr.value = bannerList.value[0].url
		
		bannerListNew.value = await miniImageApi.appointmentImageList()
	}

	// 监听页面滚动
	onPageScroll((e) => {

		if (e.scrollTop > 0.3) {
			isShow.value = false;
		}

		// 当滚动距离大于等于786rpx时，显示背景
		//isScrolled.value = e.scrollTop >= 393 // 786rpx转换为px约为393px
		/* console.log("-----------------")
		console.log(e) */
		if (e.scrollTop > 360) {
			swiperIndex.value = 1
		} else {
			swiperIndex.value = 0
		}
	})
	// 处理支付取消
	const handleCancel = () => {
		showPaymentModal.value = false; //关闭支付弹出框
		showCommoneModal.value = false; //关闭评价弹出框
		showAddServiceModal.value = false; //关闭加钟弹出框
		showAddServiceAllModal.value = false; //关闭预约评价弹出框
		countdown.value = 0

	};
	const go_any_page = (path) => {
		getApp().globalData.indexBanner = 1
		agreedPopup.value.close()
		if (path.includes('tabbar')) {
			uni.switchTab({
				url: path
			})
		} else {
			uni.navigateTo({
				url: path
			})
		}
	}
</script>

<style lang="less" scoped>
	.notLoginCss {
		padding-bottom: 50rpx;
	}

	.notLoginCssSh {
		margin-top: 40rpx;
	}

	.down {
		margin-top: 455rpx;
		margin-left: 285rpx;
	}

	.rectangle {
		background: linear-gradient(to top, rgba(234, 224, 215, 1), rgba(255, 255, 255, 0));
		height: 70px;
		width: 100%;
		margin-top: -70px;
		position: relative;
	}

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
			/* background: url("https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/header-bg.png");
			background-size: cover;
			background-position: bottom center;
			background-repeat: no-repeat; */
			color: black;
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

	.min-h-screen {
		background-color: #EAE0D7;
	}

	/* 悬浮语言开关高约 64rpx，顶部提示条下移让位，避免压住按钮文字 */
	.lang-clearance {
		height: 80rpx;
	}

	/* 续费提醒（叠放态）：压在订单卡后，露出 116rpx，两行文案完整可读 */
	.order-stack.with-strip {
		padding-top: 116rpx;
	}

	.renew-strip {
		position: absolute;
		left: 40rpx;
		right: 60rpx;
		top: 0;
		height: 148rpx;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14rpx;
		padding: 18rpx 24rpx 0;
		border-radius: 20rpx;
		background: linear-gradient(100deg, #EAD7B0 0%, #F8EDD6 56%, #EEDCBB 100%);
		border: 1rpx solid #D6B984;
		box-shadow: 0 12px 26px -18px rgba(80, 58, 20, 0.8);
		overflow: hidden;
	}

	.order-card-shifted {
		margin-left: 20rpx;
	}

	.rb-main {
		flex: 1;
		min-width: 0;
	}

	.rb-title {
		display: block;
		font-size: 25rpx;
		line-height: 1.3;
		font-weight: 600;
		color: #4B3714;
		letter-spacing: 0.04em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rb-days {
		color: #8A5A12;
	}

	.rb-sub {
		display: block;
		margin-top: 4rpx;
		font-size: 20rpx;
		line-height: 1.3;
		color: #8A6A40;
		letter-spacing: 0.03em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rb-btn {
		flex: none;
		align-self: flex-start;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 54rpx;
		padding: 0 26rpx;
		border-radius: 999rpx;
		background: #584219;
		color: #F3E9D8;
		font-size: 23rpx;
		letter-spacing: 0.08em;
		white-space: nowrap;
		box-shadow: 0 6px 14px -8px rgba(88, 66, 25, 0.9);
	}

	/* 续费提醒（独立态）：没有订单时占住卡片区 */
	.renew-slim {
		position: relative;
		z-index: 98;
		margin-top: -300rpx;
		padding: 0 40rpx 24rpx;
	}

	.rs-card {
		position: relative;
		display: flex;
		align-items: center;
		gap: 16rpx;
		padding: 22rpx 24rpx 22rpx 30rpx;
		border-radius: 22rpx;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.96);
		border: 1rpx solid rgba(88, 66, 25, 0.06);
		box-shadow: 0 18px 34px -26px rgba(88, 66, 25, 0.6);
	}

	.rs-card::before {
		content: "";
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 6rpx;
		background: linear-gradient(180deg, #D9C08A, #8A6A40);
	}

	.rs-text {
		flex: 1;
		min-width: 0;
	}

	.rs-saving {
		display: block;
		font-size: 27rpx;
		line-height: 1.3;
		font-weight: 600;
		color: #3F2D10;
		letter-spacing: 0.03em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rs-days {
		color: #8A5A12;
	}

	.rs-sub {
		display: block;
		margin-top: 6rpx;
		font-size: 22rpx;
		line-height: 1.3;
		color: #8C7A60;
		letter-spacing: 0.03em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rs-btn {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 64rpx;
		padding: 0 28rpx;
		border-radius: 999rpx;
		background: #584219;
		color: #F6F4F2;
		font-size: 25rpx;
		letter-spacing: 0.08em;
		box-shadow: 0 8px 18px -12px rgba(88, 66, 25, 0.9);
	}

	.hero-pref-row {
		display: flex;
		align-items: center;
		gap: 12rpx;
	}

	.coupon-notice-banner {
		display: flex;
		align-items: center;
		gap: 16rpx;
		margin: 16rpx 32rpx 0;
		padding: 18rpx 24rpx;
		background: #FFF9EE;
		border: 1rpx solid #EAD9BC;
		border-radius: 16rpx;
	}

	.coupon-notice-icon {
		width: 36rpx;
		height: 36rpx;
		flex-shrink: 0;
	}

	.coupon-notice-main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.coupon-notice-title {
		font-size: 25rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.coupon-notice-sub {
		margin-top: 4rpx;
		font-size: 21rpx;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.coupon-notice-action {
		flex-shrink: 0;
		padding: 8rpx 20rpx;
		background: #584219;
		color: #F3E9D8;
		font-size: 22rpx;
		border-radius: 999rpx;
		letter-spacing: 0.06em;
	}

	.hero-pref-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48rpx;
		height: 48rpx;
		border: 1rpx solid #E4DCD5;
		border-radius: 999rpx;
		background: #FFFFFF;

		&.active {
			border-color: #C5B69D;
			background: #F6F4F2;
		}

		&.muted {
			border-color: #DED9D1;
			background: #FAF9F7;
			opacity: 0.75;
		}
	}

	.hero-pref-icon {
		width: 28rpx;
		height: 28rpx;
	}
</style>