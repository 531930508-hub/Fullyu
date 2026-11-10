<template>
	<view class="min-h-screen index pb-[200rpx]">
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
			<!-- 会员卡到期引导 -->
			<view v-if="memberBanner.show" class="member-banner" @click="goMemberCard">
				<view class="member-banner-main">
					<text class="member-banner-title">{{memberBanner.title}}</text>
					<text class="member-banner-sub">{{memberBanner.sub}}</text>
				</view>
				<view class="member-banner-btn" @click.stop="renewMemberCard">{{memberBanner.action}}</view>
			</view>
			<!-- 卡券到期提醒：只在确实有提醒时出现 -->
			<view v-if="couponUnread > 0" class="coupon-notice-banner" @click="goCouponNotices">
				<image src="/static/icons/time.png" class="coupon-notice-icon" mode="aspectFit"></image>
				<view class="coupon-notice-main">
					<text class="coupon-notice-title">有 {{couponUnread > 99 ? '99+' : couponUnread}} 条卡券到期提醒</text>
					<text class="coupon-notice-sub">到期前 5 天、3 天提醒，记得安排相愈</text>
				</view>
				<text class="coupon-notice-action">去看看</text>
			</view>
			<view v-if="lastOrderInfo.length>0" class="px-5 pt-2 pb-8 w-full"
				style="position: absolute;margin-top:700rpx;height: 200rpx;z-index: 98;">
				<view class=" bg-white opacity-90 rounded-2xl text-[#584219] text-[text-_26rpx_] ">
					<view class="flex items-center justify-between px-4 py-2 rounded-t-xl  mt-1">
						<view class="flex items-center">
							<image src="/static/icons/histrory.png" mode="widthFix" class="w-[30rpx] h-[40rpx]  mr-0.5">
							</image>
							<text v-if="lastOrderInfo[0].appointmentState==1">有一个订单正在进行中</text>
							<text v-if="lastOrderInfo[0].appointmentState==2">您的上次预约</text>
							<text v-if="lastOrderInfo[0].appointmentState==0">您有一个订单尚未支付</text>
						</view>
						<text>{{lastOrderInfo[0].productTitle}} <text
								class="font-medium ml-1 ">{{lastOrderInfo[0].duration}}</text>
							mins </text>
					</view>
					<view class="w-85  rounded-full h-0.5 mb-2 bg-[#E4DCD5]" style="margin-left:7.5% ;"></view>
					<view class="flex justify-center items-center px-4 pb-2 h-[120rpx]">
						<view v-if="lastOrderInfo[0].orderDetailList[0].massagist" class="flex justify-center"
							style="width: 10%;">
							<image :src="lastOrderInfo[0].orderDetailList[0].massagist.avatarUrl" mode="widthFix"
								style="border-radius: 50%;" class="h-[60rpx] w-[60rpx]"></image>
						</view>
						<view v-if="lastOrderInfo[0].orderDetailList[0].massagist" class="ml-2" style="width: 45%;">
							<view class="text-[#1E1E1D]  ">{{lastOrderInfo[0].orderDetailList[0].massagist.name}}
							</view>
							<view class="text-[#8C8B8A]">{{lastOrderShopInfo.length>0?lastOrderShopInfo[0].name:''}}
							</view>
						</view>
						<view v-else style="width: 55%">{{lastOrderShopInfo.length>0?lastOrderShopInfo[0].name:''}}
						</view>
						<view class="flex items-center justify-end gap-2" style="width: 45%;">
							<text v-if="lastOrderInfo[0].state == 1 && lastOrderInfo[0].appointmentState == 2"
								@click.stop="opertionComment(lastOrderInfo[0])"
								class="border px-1  rounded-lg  h-[70rpx]  flex items-center justify-center ">
								评价订单
								<text style="display: block;position: absolute; margin-top: -35px; border-radius: 10px;margin-left: -15px;
								background-color:#FEE3E3;color:#FA5151  ;font-size: 20rpx;line-height: 10rpx;padding: 6px;">抽积分</text>
							</text>
							<view class="px-1 rounded-lg  h-[70rpx]  flex items-center justify-center "
								style="color:#DED9D1;border:1rpx solid #DED9D1 ;"
								v-if="lastOrderInfo[0].state == 2 && lastOrderInfo[0].appointmentState == 2">
								已评价
							</view>
							<text v-if="(lastOrderInfo[0].state == 3||lastOrderInfo[0].appointmentState == 2)"
								@click.stop="go_page_select_project(lastOrderInfo[0])"
								class="border px-3 rounded-lg  h-[70rpx]  flex items-center justify-center ">
								约TA</text>

							<text @click.stop="handleToPay(lastOrderInfo[0])" v-if="lastOrderInfo[0].state == 0"
								class="border px-3 bg-[#584219] text-white rounded-lg  h-[70rpx]  flex items-center justify-center "
								@click="openPayModelPage">立即支付
								<text style="display: block;position: absolute; margin-top: -35px; border-radius: 10px;margin-left: -15px;
								background-color:#FEE3E3;color:#FA5151  ;font-size: 20rpx;line-height: 10rpx;padding: 6px;">
									{{ lastOrderInfo[0].cutDownDes }}
								</text>
							</text>

							<text v-if="lastOrderInfo[0].state == 1 && lastOrderInfo[0].appointmentState == 1"
								class="border px-6 rounded-lg  h-[70rpx]  flex items-center justify-center "
								@click.stop="AddSercie(lastOrderInfo[0])">加钟</text>
						</view>
					</view>
					<!-- 疗愈师快捷偏好：收藏 / 暂别 -->
					<view v-if="lastOrderInfo[0].orderDetailList[0].massagist" class="home-quick-row">
						<view class="home-quick-btn"
							:class="{ active: lastOrderInfo[0].orderDetailList[0].massagist.isFavorited }"
							@click.stop="toggleFavorite(lastOrderInfo[0].orderDetailList[0].massagist)">
							<image class="home-quick-icon"
								:src="lastOrderInfo[0].orderDetailList[0].massagist.isFavorited?'/static/icons/shoucangselect.png':'/static/icons/favorite-therapist.png'"></image>
							<text>{{ lastOrderInfo[0].orderDetailList[0].massagist.isFavorited ? '已收藏' : '收藏 TA' }}</text>
						</view>
						<view class="home-quick-btn"
							:class="{ muted: lastOrderInfo[0].orderDetailList[0].massagist.isBlocked }"
							@click.stop="toggleAvoid(lastOrderInfo[0].orderDetailList[0].massagist)">
							<image class="home-quick-icon"
								:src="lastOrderInfo[0].orderDetailList[0].massagist.isBlocked?'/static/icons/avoid-therapist-check.svg':'/static/icons/avoid-therapist.svg'"></image>
							<text>{{ lastOrderInfo[0].orderDetailList[0].massagist.isBlocked ? '已暂别' : '暂别 TA' }}</text>
						</view>
					</view>
				</view>
			</view>
			<!-- <image src="/static/icons/1/Frame74.png"
				style="width:420rpx;height: 180rpx ;position: absolute;top:360rpx;left:170rpx;"></image> -->

			<!-- 轮播图区域 -->
			<view class="w-full h-[1048rpx]">

				<swiper @change="handleSwiperChange" class="w-full h-[1048rpx]" :indicator-dots="false" :autoplay="true"
					:interval="5000" :duration="500">
					<swiper-item v-for="(item, index) in bannerList" :key="index">
						<view class="w-full h-full relative overflow-hidden">
							<image :src="item.url" class="w-full h-full object-cover" mode="aspectFill" />
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

			<view class="px-5 pt-2 pb-8" style="position: relative;">
				<view class=" bg-white rounded-2xl" style="margin-top:-100rpx;">
					<!-- 顶部用户栏 -->
					<view class="flex items-center justify-between px-4 py-2 rounded-t-xl bg-[#584219] text-white">
						<text style="white-space: nowrap;overflow: hidden;width: 45%;">
							{{ userInfo.nickname!=null?'尊敬的「'+userInfo.nickname+'」':'' }}&nbsp;</text>
						<text class="text-xs text-[#FFFFFFA6]"
							@click="go_page_tabbar('/pages/mall/my-card/my-card')">可享受<text
								class="font-medium text-[34rpx] ml-1 text-white">{{ userInfo.couponCount*30 || 0}}</text>
							mins Full愈时刻</text>
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
							<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Frame264.png"
								class="w-[144rpx] h-[144rpx] mx-auto mb-2" mode="aspectFit" />
							<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Frame90.png"
								class="w-[290rpx] h-[86rpx]" mode="aspectFit" />
						</view>
						<view style="border-left: 1px solid #5842191A;height: 125rpx;"></view>
						<!-- 送心意 -->
						<view @click="go_page_tabbar('/pages/mall/mall')" class="flex flex-col">
							<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Frame265.png"
								class="w-[144rpx] h-[144rpx] mx-auto mb-2" mode="aspectFit" />
							<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Frame901.png"
								class="w-[290rpx] h-[82rpx]" mode="aspectFit" />
						</view>
					</view>
				</view>
				<view v-if="isShow" class="flex justify-center items-center w-full mt-3 text-[#8A6A40]"
					:class="{'notLoginCssSh':(!userInfo.token||userLastoneCoupon.data!=2)}">
					<!-- v-if="" -->
					<text>上滑探索更多精彩&nbsp; </text>
					<view>
						<image src="/static/icons/chevron-up.png" mode="widthFix" class="h-[24rpx] w-[24rpx]">
						</image>
					</view>
				</view>
			</view>

		</view>
		<view v-if="isShowText" style="margin-top: -40rpx;">
			<view v-if="bannerListNew.length==0" class="flex justify-center items-center  h-[90rpx]">
				<!-- <image mode="aspectFit" class="w-[480rpx] h-[100rpx]"
					src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/Frame%20280%20%282%29.png">
				</image> -->
				<text
					style="font-size: 32rpx;color: #584219;text-edge: cap;font-style: normal;font-weight: 500;line-height: 135%;">科学放松</text>
			</view>
			<view v-if="bannerListNew.length==0" class="flex justify-center items-center px-5 ">
				<view class="w-1/2 pr-2" @click="selectCard('head')">
					<image class="max-w-full " style="height: 600rpx;max-width:100% ; border-radius: 40rpx;"
						src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/headnew.jpg"></image>
				</view>
				<view class="w-1/2 pl-2" @click="selectCard('body')">
					<image class="max-w-full" style="height: 600rpx;max-width:100% ;border-radius: 40rpx;"
						src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/bodynew.jpg"></image>
				</view>
			</view>
			<view class="flex justify-center items-center h-[90rpx]">
				<!-- <image mode="aspectFit" class="w-[480rpx] h-[100rpx]"
					src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/Frame5.png"></image> -->
				<text
					style="font-size: 32rpx;color: #584219;text-edge: cap;font-style: normal;font-weight: 500;line-height: 135%;">科学放松</text>
			</view>
			<view class="flex justify-center items-center px-5  " @click="go_page_notbutton('nature-detail')">
				<image style="width: 100%;"
					src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/frame6.png"></image>
			</view>
			<view style="height: 80rpx;"></view>
		</view>
		<AiButton :yluxin="aiheightvalue"></AiButton>
		<CustomTabBar :selected="0" :list="tabBarList" />

		<!-- 评价弹框组件 -->
		<CommentFisrtModel :visible="showCommentModal" ref="refCommentFisrtModel" :order="currentCommentRecord"
			:therapists="currentCommentRecord?.orderDetailList.map(s=>s.massagist)"
			:orderId="String(currentCommentRecord?.id || '')" :showLotteryAfterSubmit="true" @cancel="hideCommentModal"
			@submit="handleCommentSubmit" />

		<!-- 加钟 -->
		<AddService ref="refAddService" :visible="showAddServiceModel" :order="orderInfo" @cancel="hideAddServiceModal"
			@submit="handleAddServiceSubmit" />
		<!-- 预约 -->
		<!-- <AddServiceAll v-if="true" ref="refAddServiceAll" :visible="showAddServiceAllModal" :orderId="orderId"
			:showLotteryAfterSubmit="true" @cancel="handleCancel" @submit="handleEvaluationSubmit" /> -->

		<!-- 支付 -->
		<PayModelPage :visible="showPaymentModal" :countdown="countdown" ref="payModelPageRef"
			@confirm="handlePaymentConfirm" @cancel="handlePaymentCancel" />

		<!-- uni-popup 组件 -->
		<uni-popup ref="agreedPopup" mode="center" style="z-index: 9999;" :maskClick="false" :disable-scroll="true">
			<view class="w-full flex justify-center items-center" @click="go_any_page(popupImageGoPath)">
				<image :src="popupImage" style="width: 600rpx;height: 800rpx;border-radius: 15rpx;"></image>
			</view>
			<view class="w-full flex justify-center items-center mt-6">
				<image @click="closeUniPopup" src="/static/icons/circle-x.png" style="width: 80rpx;height: 80rpx;">
				</image>
			</view>
		</uni-popup>
	</view>
</template>

<script setup>
	import CustomTabBar from '../../components/CustomTabBar.vue';
	import AiButton from '../../components/AiButton.vue';
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
	import massagistRateApi from "../../api/massagistRate";
	import memberCardApi from "../../api/memberCard";
	import customerMassagistRelationApi from '../../api/customerMassagistRelation'
	import customerMassagistBlockApi from '../../api/customerMassagistBlock'
	import customerNoticeApi from '../../api/customerNotice'
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
	import {
		list
	} from 'postcss';
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
		nickname: cookie.getNickname() || '未登录',
		couponCount: cookie.getCouponCount() || 0
	})

	// 用户信息
	const shop = ref('')

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
				title: '暂未登录',
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
	const isShowText = ref(false)
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

	})
	const shoplist=ref(null)
	const bannerListNew=ref([])
	// 首页门店展示与预约口径一致：按定位取最近门店，不再沿用上一单门店
	const refreshShopLabel = () => {
		shoplist.value = cookie.getStoreList()
		const nearest = cookie.getStore()
		shop.value = nearest != null ? nearest.shortAddress : '人广来福士店5F-11'
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
	// 会员卡到期引导
	const memberInfo = ref({})
	const memberSubmitting = ref(false)
	const memberBanner = computed(() => {
		const data = memberInfo.value || {}
		if (data.state !== 'expiring' && data.state !== 'expired') {
			return { show: false }
		}
		const expired = data.state === 'expired'
		const card = (expired ? data.expired : data.current) || {}
		return {
			show: true,
			state: data.state,
			cardType: card.cardType || data.renewType || 'year',
			title: expired
				? (card.cardName || 'Full愈年卡') + '已到期'
				: (card.cardName || 'Full愈年卡') + '还有 ' + data.remainingDays + ' 天到期',
			sub: expired ? '续办后继续享三店会员价' : '续办后从当前有效期结束日开始计算',
			action: expired ? '重新开通' : '一键续办'
		}
	})
	const loadMemberCard = async () => {
		if (!cookie.getToken()) {
			memberInfo.value = {}
			return
		}
		try {
			memberInfo.value = (await memberCardApi.info()) || {}
		} catch (e) {
			memberInfo.value = {}
		}
	}
	const goMemberCard = () => {
		uni.navigateTo({ url: '/pages/user/brand-member/brand-member' })
	}
	const renewMemberCard = () => {
		if (!cookie.getToken()) {
			uni.showToast({ title: '请先登录', icon: 'none' })
			setTimeout(() => {
				uni.navigateTo({ url: '/pages/login/login' })
			}, 500)
			return
		}
		if (memberSubmitting.value) {
			return
		}
		const type = memberBanner.value.cardType
		const product = (memberInfo.value.products || []).find(item => item.cardType === type) || {}
		const priceText = product.price != null ? '（¥' + product.price + '）' : ''
		uni.showModal({
			title: memberBanner.value.action,
			content: '确认' + memberBanner.value.action + (product.cardName || '会员卡') + priceText + '？会员卡开通后不可退，权益不折现、不转让。',
			confirmText: '确认',
			confirmColor: '#584219',
			success: async (res) => {
				if (!res.confirm) {
					return
				}
				memberSubmitting.value = true
				try {
					const result = await memberCardApi.purchase({ cardType: type, agreeTerms: true })
					if (result && result.info) {
						memberInfo.value = result.info
					} else {
						await loadMemberCard()
					}
					uni.showToast({ title: '续办成功', icon: 'none' })
				} catch (e) {
					// 错误提示已由请求层统一处理
				} finally {
					memberSubmitting.value = false
				}
			}
		})
	}
	onShow(() => {
		updateUser()
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
			memberInfo.value = {}
			couponUnread.value = 0
		}
		//根据位置获取最近的店铺列表
		locationWZ()
	})
	//去支付按钮
	const payModelPageRef = ref(null)
	const handleToPay = (record) => {
		console.log(record)
		const createTime = Date.parse(record.createTime) / 1000
		const currentTime = Date.parse(new Date()) / 1000
		if (record.overTimeSeconds) {
			countdown.value = Math.max(0, Math.floor(record.overTimeSeconds - (currentTime - createTime)));
		} else {
			countdown.value = constant.payCutDownSeconds;
		}
		if (countdown.value > 0) {
			showPaymentModal.value = true; //支付弹出框弹出
			if (payModelPageRef) {
				payModelPageRef.value.fetchData(record.id)
			}
		} else {
			countdown.value = 0
			getLastOrderInfo()
		}
	}
	const handlePaymentConfirm = (paymentData) => {
		console.log('支付信息:', paymentData);
		showPaymentModal.value = false;
		cookie.updCouponCount()
		cookie.updIntegration()
		if (paymentData == 'notpay') {
			//getLastOrderInfo()
			uni.showToast({
				title: '未支付！',
				icon: "error"
			});
		} else {
			getLastOrderInfo()
			uni.showToast({
				title: '支付成功！',
			});
		}
	}
	const handlePaymentCancel = () => {
		showPaymentModal.value = false;
		//getLastOrderInfo()
	}

	//再次预约
	const go_page_select_project = (record) => {
		console.log(record)
		console.log(record.shopId)
		if (record.orderDetailList[0].massagist != null) {
			console.log(record.orderDetailList[0].massagist)
			uni.navigateTo({
				url: '/pages/index/select-project?projectId=' + record.orderDetailList[0].projectId +
					'&projectMinute=' + record.orderDetailList[0].duration + '&massagistName=' + record
					.orderDetailList[0].massagist.name +
					'&massagistId=' + record.orderDetailList[0].massagist.id + '&shopId=' + record
					.orderDetailList[0].massagist.shopId
			})
		} else {
			uni.navigateTo({
				url: '/pages/index/select-project?projectId=' + record.orderDetailList[0].projectId +
					'&projectMinute=' + record.orderDetailList[0].duration + '&shopId=' + record.shopId
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
			title: '处理中',
			mask: true,
		})
		console.log("serviceData")
		console.log(serviceData)
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
				title: '未找到对应的产品！',
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
		const orderId = await orderApi.createOrder({
			...formData,
			appointmentType: 2
		}) || ''

		console.log(orderId)
		hideAddServiceModal() //隐藏加钟框
		orderInfo.value = await orderApi.infoWithDetail(orderId)
		uni.hideLoading();
		if (!orderInfo.value) {
			uni.showToast({
				title: '订单不存在',
				icon: 'none'
			});
		} else if (orderInfo.value.state == 1 || orderInfo.value.state == 2) {
			uni.showToast({
				title: '订单已支付',
				icon: 'none'
			});
		} else if (orderInfo.value.state == 3 || orderInfo.value.state == 4) {
			uni.showToast({
				title: '订单已取消',
				icon: 'none'
			});
		} else if (orderInfo.value.state == 5 || orderInfo.value.state == 6) {
			uni.showToast({
				title: '订单已退款',
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
				showPaymentModal.value = true; //支付弹出框弹出
				if (payModelPageRef) {
					payModelPageRef.value.fetchData(orderId)
				}
			} else {
				countdown.value = 0
				uni.showToast({
					title: '订单已取消',
					icon: 'none'
				});
			}
		}
	}


	//评价模块
	const showCommentModal = ref(false)
	const currentCommentRecord = ref(null)
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
		console.log('提交评价数据:', evaluationData)
		const data = await massagistRateApi.createBatch(evaluationData)
		// 显示成功提示
		uni.showToast({
			title: '评价提交成功！',
			icon: 'success',
			duration: 1000
		});
		getLastOrderInfo()
		// 隐藏弹框
		hideCommentModal()
	}


	//获取最后一个订单
	const lastOrderInfo = ref([])
	const lastOrderShopInfo = ref([])
	//卡券到期未读提醒数：为 0 时首页不出现提醒框
	const couponUnread = ref(0)
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
		const currentTimeNew = new Date();
		console.log("currentTimeNew------")
		console.log(currentTimeNew)
		list.forEach(o => {
			if (o.state == 0) {
				const createTime = Date.parse(o.createTime) / 1000
				const currentTime = Date.parse(currentTimeNew) / 1000
				const payCutDownSeconds = o.overTimeSeconds || constant.payCutDownSeconds
				o.cutdown = Math.max(0, Math.floor(payCutDownSeconds - (currentTime - createTime)))
				if (o.cutdown > 0) {
					o.cutDownDes = getCutDown(o)
				}
			}
		})
		startCountdown()
		lastOrderInfo.value = list
		await loadMassagistPreferences()
		if (list.length > 0) {
			let listShop = cookie.getStoreList()
			lastOrderShopInfo.value = listShop.filter(t => {
				return t.id == list[0].shopId
			})

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
					title: '提示',
					content: '确定要取消收藏吗？',
					confirmText: '确定',
					cancelText: '取消',
					success: resolve
				})
			})
			if (!res.confirm) return
			await customerMassagistRelationApi.remove(massagist.relationId)
			uni.showToast({
				title: '已取消收藏',
				icon: 'none'
			})
			await loadMassagistPreferences()
			return
		}
		const wasBlocked = !!massagist.isBlocked
		await customerMassagistRelationApi.createRelation(massagist.id)
		uni.showToast({
			title: '收藏成功',
			icon: 'success'
		})
		await loadMassagistPreferences()
		if (wasBlocked) {
			setTimeout(() => {
				uni.showToast({
					title: '已同时解除暂别',
					icon: 'none'
				})
			}, 1800)
		}
	}
	const toggleAvoid = async (massagist) => {
		if (!massagist) return
		if (massagist.isBlocked) {
			await customerMassagistBlockApi.remove(massagist.blockId)
			uni.showToast({
				title: '已恢复，可以正常预约 TA 了',
				icon: 'none'
			})
			await loadMassagistPreferences()
			return
		}
		const res = await new Promise((resolve) => {
			uni.showModal({
				title: '暂时不约 TA？',
				content: `之后预约时会自动避开「${massagist.name}」，TA 不会收到任何通知，随时可以恢复。`,
				confirmText: '暂时不约',
				cancelText: '再想想',
				confirmColor: '#7A736B',
				success: resolve
			})
		})
		if (!res.confirm) return
		const wasFavorited = !!massagist.isFavorited
		await customerMassagistBlockApi.createRelation(massagist.id)
		uni.showToast({
			title: '已设为暂别，之后自动避开 TA',
			icon: 'none'
		})
		await loadMassagistPreferences()
		if (wasFavorited) {
			setTimeout(() => {
				uni.showToast({
					title: '已同时取消对 TA 的收藏',
					icon: 'none'
				})
			}, 1800)
		}
	}
	let cutDownTimer = null;
	const startCountdown = () => {
		if (cutDownTimer) clearInterval(cutDownTimer);
		cutDownTimer = setInterval(() => {
			lastOrderInfo.value.forEach(o => {
				if (o.state == 0 && o.cutdown > 0) {
					o.cutdown = Math.max(0, o.cutdown - 1)
					o.cutDownDes = getCutDown(o)
					if (o.cutdown == 0) {
						o.state = 3
						o.appointmentState = 3
						getLastOrderInfo()
					}
				}
			})
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

		return '倒计时：' + hours + ':' + min + ':' + second;
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
		bannerImageStr.value = bannerList.value[0].url
		
		bannerListNew.value = await miniImageApi.appointmentImageList()
	}

	// 监听页面滚动
	onPageScroll((e) => {

		if (e.scrollTop > 0.3) {
			isShow.value = false;
			isShowText.value = true;
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

	.member-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 20rpx 32rpx 0;
		padding: 22rpx 26rpx;
		background: #FBF4E8;
		border: 1rpx solid #E7D6B4;
		border-radius: 16rpx;
	}

	.home-quick-row {
		display: flex;
		align-items: center;
		gap: 12rpx;
		padding: 0 32rpx 18rpx;
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

	.home-quick-btn {
		display: flex;
		align-items: center;
		gap: 6rpx;
		padding: 6rpx 16rpx;
		border: 1rpx solid #E4DCD5;
		border-radius: 999rpx;
		background: #FFFFFF;
		font-size: 21rpx;
		color: #8A6A40;
		letter-spacing: 0.05em;

		&.active {
			border-color: #C5B69D;
			background: #F6F4F2;
			color: #584219;
		}

		&.muted {
			border-color: #DED9D1;
			background: #FAF9F7;
			color: #9A948C;
		}
	}

	.home-quick-icon {
		width: 26rpx;
		height: 26rpx;
	}

	.member-banner-main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.member-banner-title {
		font-size: 26rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.member-banner-sub {
		margin-top: 6rpx;
		font-size: 22rpx;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.member-banner-btn {
		margin-left: 20rpx;
		padding: 10rpx 26rpx;
		background: #584219;
		color: #F3E9D8;
		font-size: 23rpx;
		border-radius: 999rpx;
		letter-spacing: 0.06em;
		flex-shrink: 0;
	}
</style>