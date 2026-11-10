<template>
	<view class="min-h-screen  bg-[#EAE0D7] text-[#584219] pb-[140rpx]">
		<!-- 语言开关：切换会员相关页面文案，不改变历史订单等业务数据 -->
		<view class="user-lang" @click="toggleLocale">{{ lang === 'en' ? '中' : 'EN' }}</view>
		<view class="w-full h-[600rpx]">
			<image
				src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260111/2fbd6f02-dbf0-4bd9-adef-05913d2816f2(._.)userinfo.png"
				mode="aspectFill" style="height: 100%; width: 100%;"></image>
		</view>
		<view class="rectangle"></view>
		<view class="px-5" style=" position: relative;">
			<view class="px-3 pt-3 bg-white  rounded-2xl" style="margin-top: -310rpx;position: relative;z-index: 98;">
				<view class="flex pb-3" style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-1/2 flex items-center text-[30rpx] font-semibold">
						<view>
							<button v-if="!userInfo.token" class="btnClearCss" @click="goLogin">
								<image class="avatar" src="/static/icons/morenlogo.png" mode="aspectFill"></image>
							</button>
							<button v-if="userInfo.token" class="btnClearCss" open-type="chooseAvatar"
								@chooseavatar="chooseAvatar" style="z-index: 1">
								<image class="avatar" :src="userInfo.avatar||'/static/icons/morenlogo.png'"
									mode="aspectFill"></image>
							</button>
						</view>
						<view v-if="userInfo.token" class="justify-around items-center flex">
							<input class="username ml-2" type="nickname" v-model="userInfo.nickname" ref="nicknameInput"
								@change="changeNickname" :style="{ width: inputWidth + 'rpx' }" :focus="isFocus"
								@blur="isFocus = false" />
							<image class="edit-icon" src="/static/icons/edit.png" mode="aspectFit" @click="focusInput">
							</image>
						</view>
						<view v-else class="ml-2">
							欢迎新朋友
						</view>
						<text class="text-measure text-lg">{{userInfo.nickname}}</text>
					</view>
					<view v-if="userInfo.token" class="w-1/2">
						<view class="flex justify-end pr-2" v-if="userLastoneCoupon.data==2||userLastoneCoupon.data==3||userLastoneCoupon.data==4">
							<image src="/static/icons/crown.png" class="w-[60rpx] h-[40rpx]"></image>
						</view>
						<view v-if="userLastoneCoupon.data==2||userLastoneCoupon.data==3||userLastoneCoupon.data==4" class="flex justify-end text-[28rpx]">
							{{userLastoneCoupon.couponTitle}}
						</view>
					</view>
					<view v-else class="w-1/2 flex justify-end items-center">
						<view class="text-[#8A6A40] text-[30rpx]" @click="goLogin">登录/注册</view>
					</view>
				</view>
				<view v-if="userInfo.token" class="flex justify-center items-center "
					style="border-bottom: 1px solid #E6E2DC;">
					<view v-if="userLastoneCoupon.data==2" class="mt-4 mb-4" style="width: 95%; text-[24rpx]">
						<view class="flex justify-center items-center text-[24rpx] text-[#584219]">
							<view class=" w-2/3 text-left ">{{userLastoneCoupon.datetimeStop}}</view>
							<view class=" w-2/3 text-right">
								<text
									class="px-1 py-1 rounded-lg bg-[#8A6A40] text-white ">&nbsp;{{userLastoneCoupon.datetimeCount}}&nbsp;</text>
							</view>
						</view>
						<view class="w-full bg-gray-200 rounded-full h-0.5 mb-2 mt-2">
							<view :style="{width: userLastoneCoupon.percentageStr, backgroundColor: '#584219'}"
								class="h-0.5 rounded-full">
							</view>
						</view>
						<view class="flex justify-center items-center text-[24rpx] text-[#584219] pt-1">
							<view class=" w-3/4 text-left ">{{userLastoneCoupon.couponComment}}</view>
							<view class=" w-1/4 text-right">{{userLastoneCoupon.couponUserCount}}</view>
						</view>
					</view>
					<view v-if="userLastoneCoupon.data==1" class="mt-4 mb-4" style="width: 95%; text-[24rpx]">
						<view class="flex justify-center items-center text-[24rpx] text-[#584219]">
							<view class=" w-2/3 text-left ">您的富翁卡已用完</view>
							<view class=" w-2/3 text-right">
								<text @click="go_page_tabbar_buy('/pages/mall/mall')"
									class="px-1 py-1 rounded-lg bg-[#8A6A40] text-white ">&nbsp;重新购买&nbsp;</text>
							</view>
						</view>
					</view>
					<view v-if="userLastoneCoupon.data==0" class="mt-4 mb-4" style="width: 95%; text-[24rpx]">
						<view class="flex justify-center items-center text-[24rpx] text-[#584219]">
							<view class=" w-2/3 text-left ">您还没有购买富翁卡</view>
							<view class=" w-2/3 text-right">
								<text @click.stop="go_page_tabbar_buy('/pages/mall/mall')"
									class="px-1 py-1 rounded-lg bg-[#8A6A40] text-white ">&nbsp;去购买&nbsp;</text>
							</view>
						</view>
					</view>
					<view v-if="userLastoneCoupon.data==3" class="mt-4 mb-4" style="width: 95%; text-[24rpx]">
						<view class="flex justify-center items-center text-[24rpx] text-[#584219] pt-1">
							<view class=" w-3/4 text-left ">{{userLastoneCoupon.couponComment}}</view>
							<view class=" w-1/4 text-right">{{userLastoneCoupon.couponUserCount}}</view>
						</view>
					</view>
					<view v-if="userLastoneCoupon.data==4" class="mt-4 mb-4" style="width: 95%; text-[24rpx]">
						<view class="flex justify-center items-center text-[24rpx] text-[#584219]">
							<view class=" w-2/3 text-left ">您已购买富翁卡</view>
							<view class=" w-2/3 text-right">
								<text @click="go_page('/pages/index/select-project')"
									class="px-1 py-1 rounded-lg bg-[#8A6A40] text-white ">&nbsp;去使用&nbsp;</text>
							</view>
						</view>
					</view>
				</view>
				<view v-else class="flex justify-center items-center " style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-full pt-5 pb-5">为了给您提供更好的服务请注册登陆</view>
				</view>
				<view class="flex justify-around  pb-4 items-center mt-3">
					<!-- 预约 -->
					<view @click="go_page_valid_login('/pages/user/points/points')" class="flex flex-col w-[48%]">
						<view v-if="userInfo.integration>0"
							class="text-center text-[#584219] text-[48rpx] text-[#D2956E] font-semibold w-full">
							{{ userInfo.integration || 0 }}<text class="text-[30rpx] font-medium">积分</text>
						</view>
						<view v-if="userInfo.integration>0" class="text-[#584219] text-[28rpx] text-center pt-2 pb-2">
							可抵扣{{ userInfo.integration || 0 }}元</view>
						<view v-else class="text-[#584219] text-[28rpx] text-center pt-2 pb-2">您还没有积分</view>
						<view v-if="userInfo.integration>0" class="flex justify-center items-center text-[24rpx]">
							<text>{{invalidIntegration||0}}积分将于12/31号过期</text>
							<image src="/static/icons/arrow-right.png" class="w-[24rpx] h-[24rpx]"></image>
						</view>
						<view v-else class="flex justify-center items-center text-[24rpx]">
							<text>1积分可以抵扣1元</text>
						</view>
					</view>
					<view style="border-left: 1px solid #5842191A;height: 125rpx;"></view>
					<!-- 送心意 -->
					<view @click="go_page_valid_login('/pages/mall/my-card/my-card')" class="flex flex-col w-[48%]">
						<view v-if="userInfo.couponCount>0"
							class="text-center text-[#584219] text-[48rpx] text-[#D2956E] font-semibold w-full">
							{{userInfo.couponCount||0}}<text class="text-[30rpx] font-medium">张Full愈券</text>
						</view>
						<view v-if="userInfo.couponCount>0" class="text-[#584219] text-[28rpx] text-center pt-2 pb-2">
							剩余{{userInfo.couponCount||0}}/{{allcouponCount}}张</view>
						<view v-else class="text-[#584219] text-[28rpx] text-center pt-2 pb-2">您还没有Full愈券</view>
						<view v-if="userInfo.couponCount>0" class="flex justify-center items-center text-[24rpx]">
							<text>还可以享受{{ userInfo.couponCount*30 || 0}}mins</text>
						</view>
						<view v-else class="flex justify-center items-center text-[24rpx]">
							<text>购买券包可享最高优惠</text>
						</view>
					</view>
				</view>
			</view>
			<!-- Full愈年卡 · 品牌通用会员（未登录也展示入口，避免找不到会员功能） -->
			<view class="year-card mt-2" @click="goMemberCard">
				<view class="flex items-center justify-between">
					<text class="year-card-eyebrow">FULL YU ANNUAL MEMBER</text>
					<text class="year-card-tag">{{ userInfo.token ? yearCardTag : '权益卡 · 三店通用' }}</text>
				</view>
				<view class="year-card-title">Full愈年卡</view>
				<view class="year-card-desc mt-1">{{ userInfo.token ? yearCardDesc : '¥299 / 年 · 月卡 ¥45 · 登录后查看积分与有效期' }}</view>
				<view class="year-card-foot flex items-center justify-between">
					<text>时叙 · 在场 · 轻疗　三店通用</text>
					<view class="flex items-center">
						<text class="year-card-link">{{ userInfo.token ? (yearCardState==='none'||yearCardState==='expired' ? '去开通' : '查看') : '登录查看' }}</text>
						<image src="/static/icons/arrow-right.png" class="w-[30rpx] h-[30rpx]"></image>
					</view>
				</view>
			</view>
			<view v-if="userInfo.token" class="mt-2">
				<CouponNoticePanel ref="noticePanel" :key="noticePanelKey" />
			</view>
			<view class="bg-white  rounded-2xl mt-2 pl-4 pr-2 pt-1 pb-1 text-[28rpx]">
				<view @click="navigateTo('/pages/user/collect/collect','')" class="flex items-center h-[110rpx]"
					style="border-bottom: 1px solid #E6E2DC;">
					<view class="flex items-center" style="width: 5%;">
						<image src="/static/icons/shoucang.png" class="w-[30rpx] h-[30rpx]"></image>
					</view>
					<view class="flex items-center pl-2" style="width: 85%;">我的收藏</view>
					<view class="flex items-center justify-end" style="width: 10%;">
						<image src="/static/icons/arrow-right.png" class="w-[40rpx] h-[40rpx]"></image>
					</view>
				</view>
				<view @click="navigateTo('/pages/user/invitation-reward','')" class="flex items-center h-[110rpx]"
					style="border-bottom: 1px solid #E6E2DC;">
					<view class="flex items-center" style="width: 5%;">
						<image src="/static/icons/fengxiang.png" class="w-[30rpx] h-[30rpx]"></image>
					</view>
					<view class="flex items-center pl-2" style="width: 85%;">邀请有礼</view>
					<view class="flex items-center justify-end" style="width: 10%;">
						<image src="/static/icons/arrow-right.png" class="w-[40rpx] h-[40rpx]"></image>
					</view>
				</view>
				<view @click="navigateTo('/pages/user/redeem-coupons','')" class="flex items-center h-[110rpx]"
					style="border-bottom: 1px solid #E6E2DC;">
					<view class="flex items-center" style="width: 5%;">
						<image src="/static/icons/redeem-coupons.png" class="w-[30rpx] h-[30rpx]"></image>
					</view>
					<view class="flex items-center pl-2" style="width: 85%;">礼品卡兑换</view>
					<view class="flex items-center justify-end" style="width: 10%;">
						<image src="/static/icons/arrow-right.png" class="w-[40rpx] h-[40rpx]"></image>
					</view>
				</view>
				<view @click="navigateTo('','lianxi')" class="flex items-center h-[110rpx]"
					style="border-bottom: 1px solid #E6E2DC;">
					<view class="flex items-center" style="width: 5%;">
						<image src="/static/icons/lianxikefu.png" class="w-[30rpx] h-[30rpx]"></image>
					</view>
					<view class="flex items-center pl-2" style="width: 85%;">联系客服</view>
					<view class="flex items-center justify-end" style="width: 10%;">
						<image src="/static/icons/arrow-right.png" class="w-[40rpx] h-[40rpx]"></image>
					</view>
				</view>
				<view @click="navigateTo('enterprise-code/enterprise-code','')" class="flex items-center h-[110rpx]"
					style="border-bottom: 1px solid #E6E2DC;">
					<view class="flex items-center" style="width: 5%;">
						<image src="/static/icons/wendang.png" class="w-[30rpx] h-[30rpx]"></image>
					</view>
					<view class="flex items-center pl-2" style="width: 85%;">加入社群</view>
					<view class="flex items-center justify-end" style="width: 10%;">
						<image src="/static/icons/arrow-right.png" class="w-[40rpx] h-[40rpx]"></image>
					</view>
				</view>
				<view @click="navigateTo('about','')" class="flex items-center h-[110rpx]">
					<view class="flex items-center" style="width: 5%;">
						<image src="/static/icons/xiaolian.png" class="w-[30rpx] h-[30rpx]"></image>
					</view>
					<view class="flex items-center pl-2" style="width: 85%;">关于Full愈</view>
					<view class="flex items-center justify-end" style="width: 10%;">
						<image src="/static/icons/arrow-right.png" class="w-[40rpx] h-[40rpx]"></image>
					</view>
				</view>

			</view>
			<view v-if="userInfo.token" @click="navigateTo('','退出登录')"
				class="text-center text-[#584219] h-[100rpx] pt-4 text-[28rpx] "> 退出登录
			</view>
		</view>

		<AiButton :yluxin="aiheightvalue"></AiButton>
		<CustomTabBar :selected="4" :list="tabBarList" />
	</view>
</template>

<script setup>
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
		getCurrentInstance,
		watch
	} from 'vue'
	import {
		uploadAvatar
	} from "@/api/upload"
	import CustomTabBar from '../../components/CustomTabBar.vue';
	import AiButton from '../../components/AiButton.vue';
	import miniImageApi from "../../api/miniImage"
	import cookie from "../../utils/cookieUtil"
	import customerApi from '../../api/customer'
	import customerCouponApi from '../../api/customerCoupon'
	import { loadBrandMember } from '../../api/brandMember'
	import { useLocale } from '../../utils/locale'
	const { lang, toggleLocale, syncLocale } = useLocale()
	import CouponNoticePanel from '../../components/CouponNoticePanel.vue'
	const noticePanel = ref(null)
	const noticePanelKey = ref(0)
	const {
		proxy
	} = getCurrentInstance()
	const vm = proxy
	const vipLevel = ref(cookie.getVipLevel() || null);
	const isFocus = ref(false)
	const inputWidth = ref(56)
	const invalidIntegration = ref(0)
	const allcouponCount = ref(0)
	const nicknameInput = ref()
	// 模板始终按对象读取（userLastoneCoupon.data），接口异常时也必须保持对象，否则整页渲染报错。
	const userLastoneCoupon = ref({})
	//Full愈年卡
	const memberCardInfo = ref({})
	const yearCardState = computed(() => memberCardInfo.value.state || 'none')
	const yearCardTag = computed(() => {
		switch (yearCardState.value) {
			case 'active':
				return '生效中'
			case 'expiring':
				return '即将到期'
			case 'pending':
				return '待生效'
			case 'expired':
				return '已到期'
			default:
				return '权益卡 · 三店通用'
		}
	})
	const yearCardDesc = computed(() => {
		const data = memberCardInfo.value
		const advance = data.advanceDiscountText || '7.8 折'
		const points = Number(data.points != null ? data.points : userInfo.value.integration) || 0
		switch (yearCardState.value) {
			case 'active':
			case 'expiring':
				return `剩余 ${data.remainingDays || 0} 天 · 积分 ${points} · 轻疗提前预约${advance}`
			case 'pending':
				return `${(data.pending && data.pending.startTime) || ''} 起进入新权益期`
			case 'expired':
				return '年卡已到期 · 续费后继续享三店会员价'
			default:
				return '¥299 / 年 · 月卡 ¥45 · 时叙、在场、轻疗三店通用'
		}
	})
	const goMemberCard = () => {
		if (!cookie.getToken()) {
			uni.navigateTo({ url: '/pages/login/login' })
			return
		}
		uni.navigateTo({
			url: '/pages/user/brand-member/brand-member'
		})
	}
	/**
	 * 入口状态必须和会员页同源：都读 CRM 品牌会员，不再用本地 memberCard 接口，
	 * 否则会出现「入口显示生效、点进去是另一套卡」的分叉。
	 */
	const fetchMemberCard = async () => {
		if (!cookie.getToken()) {
			memberCardInfo.value = {}
			return
		}
		try {
			const brand = await loadBrandMember()
			const card = (brand && brand.card) || {}
			memberCardInfo.value = {
				state: String(card.state || 'NONE').toLowerCase(),
				remainingDays: card.remainingDays,
				startTime: card.validFrom,
				endTime: card.validUntil,
				pending: card.pendingStart ? { startTime: card.pendingStart } : null,
				points: brand && brand.points ? brand.points.balance : undefined
			}
		} catch (e) {
			memberCardInfo.value = {}
		}
	}
	

	onShow(() => {
		syncLocale()
		updateUser()
		noticePanelKey.value++
		nextTick(() => {
			noticePanel.value?.refresh()
			updateInputWidth()
		})
		// 未登录时不请求任何个人数据：这些接口会返回 401，拦截器随即把游客弹去登录页，
		// 结果是「我的」页的品牌会员入口根本来不及被看见。游客态只展示静态入口。
		if (!cookie.getToken()) {
			memberCardInfo.value = {}
			userLastoneCoupon.value = {}
			return
		}
		getInvalidIntegration()
		getUserAllCouponCount()
		getUserLastoneCoupon()
		fetchMemberCard()
		cookie.updIntegration()
		cookie.updCouponCount()
	})
	const focusInput=()=>{
		 isFocus.value=true
	}

	//获取用户最后一次购卡劵信息
	const getUserLastoneCoupon = async () => {
		try {
			const info = await customerCouponApi.getUserLastoneCoupon()
			userLastoneCoupon.value = info && typeof info === 'object' ? info : {}
		} catch (e) {
			userLastoneCoupon.value = {}
		}
	}
	//获取用户卡券的总数量
	const getUserAllCouponCount = async () => {
		allcouponCount.value = await customerCouponApi.getUserAllCouponCount()
	}
	//获取即将过期积分
	const getInvalidIntegration = async () => {
		invalidIntegration.value = await customerApi.getInvalidIntegration()
	}

	// 用户信息
	const userInfo = ref({
		avatar: cookie.getAvatar(),
		nickname: cookie.getNickname(),
		couponCount: cookie.getCouponCount(),
		integration: cookie.getIntegration(),
		token: cookie.getToken()
	});
	//需要登录的跳转
	const go_page_valid_login = (path) => {
		if (!checkLogin()) {
			return
		}
		if (path == '/pages/user/points/points') {
			uni.navigateTo({
				url: path
			})
		} else {
			uni.switchTab({
				url: path
			})
		}

	}


	const go_page = (path) => {
		uni.navigateTo({
			url: path
		})
	}


	const customBar = ref(0)
	const statusBar = ref(0)
	const aiheightvalue = ref(0)
	onLoad((options) => {
		if (options) {}
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

	});



	const updateUser = () => {
		userInfo.value = {
			avatar: cookie.getAvatar(),
			nickname: cookie.getNickname(),
			integration: cookie.getIntegration(),
			couponCount: cookie.getCouponCount(),
			token: cookie.getToken()
		}
		vipLevel.value = cookie.getVipLevel()
	}

	const goLogin = () => {
		uni.navigateTo({
			url: '/pages/login/login'
		})
	}
	const go_page_tabbar = () => {
		uni.switchTab({
			url: '/pages/mall/my-card/my-card'
		})
	}
	const go_page_tabbar_buy = (path) => {
		uni.switchTab({
			url: path
		})
	}
	// 保存头像到服务器并更新用户信息
	const chooseAvatar = async (e) => {
		if (!userInfo.value.token) {
			return
		}
		const data = await uploadAvatar(e.detail.avatarUrl)
		const customer = await customerApi.updateAvatar(data)

		cookie.saveAuth(customer)
		updateUser()
		uni.showToast({
			title: '更新成功',
			duration: 3000
		});
	}
	// 保存并更新用户昵称
	const changeNickname = async () => {
		if (userInfo.value.nickname == cookie.getNickname()) {
			return
		}
		const customer = await customerApi.updateNickname(userInfo.value.nickname)
		cookie.saveAuth(customer)
		updateUser()
		uni.showToast({
			title: '更新成功',
			duration: 3000
		});
	}


	watch(() => userInfo.value.nickname, (newValue) => {
		if (newValue) {
			nextTick(() => {
				updateInputWidth();
			});
		}
	});


	const checkLogin = () => {
		//先校验登录
		if (!cookie.getToken()) {
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
		}
		return true
	}
	// 页面跳转方法
	const navigateTo = (path, item) => {
		if (path) {
			if (path == "/pages/user/redeem-coupons" || path == "/pages/user/invitation-reward" || path ==
				"/pages/user/collect/collect") {
				if (checkLogin()) {
					uni.navigateTo({
						url: path
					});
				}
			} else {
				uni.navigateTo({
					url: path
				});
			}
		} else {
			if (item === '退出登录') {
				uni.showModal({
					title: '提示',
					content: '确定要退出登录吗',
					confirmText: "确定",
					success: function(res) {
						if (res.confirm) {
							vm.$Cache.remove('userInfo')
							vm.$Cache.remove('token')
							cookie.clearUser()
							updateUser()
							getUserAllCouponCount()
						}
					}
				});
			} else {
				// 联系客服功能
				uni.showModal({
					title: "联系客服",
					cancelText: "取消",
					confirmText: "拨打电话",
					content: "客服电话：400-080-4188 工作时间：10:00-22:00",
					success(res) {
						if (res.confirm) {
							uni.makePhoneCall({
								phoneNumber: "400-080-4188"
							})
						}
					}
				})
			}
		}
	};

	function updateInputWidth() {
		// 获取测量元素的宽度
		uni.createSelectorQuery().in(vm).select('.text-measure').boundingClientRect(rect => {
			if (rect) {
				console.log("--------------")
				let wid=rect.width+70;
				inputWidth.value = Math.min(wid);
			}
		}).exec();
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
</script>

<style lang="less" scoped>
	.user-lang {
		position: fixed;
		top: 100rpx;
		right: 28rpx;
		z-index: 99;
		min-width: 64rpx;
		height: 48rpx;
		line-height: 48rpx;
		padding: 0 16rpx;
		text-align: center;
		border-radius: 999rpx;
		background: rgba(255, 253, 248, 0.85);
		color: #584219;
		font-size: 22rpx;
		box-shadow: 0 6rpx 16rpx -8rpx rgba(88, 66, 25, 0.4);
	}

	.text-measure {
	  position: absolute;
	  top: -9999px;
	  left: -9999px;
	  visibility: hidden;
	  white-space: nowrap;
	  font-size: 36upx;
	  font-weight: 500;
	}
	.btnClearCss {
		padding: 0;
		background-color: white;
	}

	.avatar-container {
		margin-right: 30rpx;
	}

	.avatar {
		width: 90rpx;
		height: 90rpx;
		border-radius: 50%;
	}

	.edit-icon {
		width: 32upx;
		height: 32upx;
	}

	.rectangle {


		background: linear-gradient(to top, rgba(234, 224, 215, 1), rgba(255, 255, 255, 0));
		height: 70px;
		width: 100%;
		margin-top: -70px;
		position: relative;
	}

	.year-card {
		padding: 26rpx 30rpx;
		border-radius: 20rpx;
		background: linear-gradient(120deg, #584219 0%, #8A6A40 100%);
		box-shadow: 0 10rpx 24rpx -12rpx rgba(88, 66, 25, 0.45);
	}

	.year-card-eyebrow {
		font-size: 18rpx;
		line-height: 26rpx;
		color: rgba(228, 200, 146, 0.72);
		letter-spacing: 0.18em;
	}

	.year-card-title {
		margin-top: 6rpx;
		font-size: 34rpx;
		line-height: 46rpx;
		font-weight: 600;
		color: #F6F4F2;
		letter-spacing: 0.06em;
		font-family: SourceHanSerifSC;
	}

	.year-card-tag {
		margin-left: 12rpx;
		padding: 2rpx 10rpx;
		border-radius: 8rpx;
		font-size: 20rpx;
		line-height: 28rpx;
		color: #584219;
		background: #E4C892;
		letter-spacing: 0.05em;
	}

	.year-card-desc {
		font-size: 23rpx;
		color: rgba(246, 244, 242, 0.82);
		letter-spacing: 0.05em;
	}

	.year-card-foot {
		margin-top: 10rpx;
		padding-top: 10rpx;
		border-top: 1rpx solid rgba(228, 200, 146, 0.22);
		font-size: 20rpx;
		color: rgba(246, 244, 242, 0.58);
		letter-spacing: 0.1em;
	}

	.year-card-link {
		font-size: 23rpx;
		color: #E4C892;
		margin-right: 4rpx;
		letter-spacing: 0.05em;
	}
</style>