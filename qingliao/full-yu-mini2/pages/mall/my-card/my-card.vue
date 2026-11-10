<template>
	<view class="min-h-screen  bg-[#F6F4F2] pb-[200rpx]">
		<TopTitleNotBack></TopTitleNotBack>
		<view class="tab-nav" :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">
			<view v-for="(tab, index) in tabs" :key="index" :class="['tab-item', { active1: activeTab === index }]"
				@click="go_page_new(tab.status)">
				{{ tab.name }}
			</view>
		</view>

		<view :style="{marginTop:customBar+'px'}">
			<!-- Full愈年卡 · 品牌通用会员 -->
			<view class="px-5 pt-4">
				<view class="member-strip" @click="goMemberCard">
					<view>
						<view class="member-strip-title">Full愈年卡</view>
						<view class="member-strip-sub">
							<text v-if="memberCardInfo.state === 'active' || memberCardInfo.state === 'expiring'">生效中 · 剩余 {{memberCardInfo.remainingDays}} 天 · 三店通用</text>
							<text v-else-if="memberCardInfo.state === 'pending'">续费已排期</text>
							<text v-else-if="memberCardInfo.state === 'expired'">已到期，可续费</text>
							<text v-else>未开通 · 三店通用 · 月卡 ¥45 起</text>
						</view>
					</view>
					<view class="member-strip-btn">{{ memberCardInfo.state === 'active' || memberCardInfo.state === 'expiring' ? '查看' : '去开通' }}</view>
				</view>
			</view>

			<view v-if="noticeLoggedIn" class="px-5 pt-4">
					<CouponNoticePanel ref="noticePanel" :key="noticePanelKey"
						:default-expanded="noticeAutoExpand" />
				</view>

				<!-- 其他卡券：会员卡置顶后降级收纳，可展开 -->
			<view class="px-5 pt-4">
				<view class="legacy-header" @click="toggleLegacyCards">
					<view class="flex items-center">
						<text class="legacy-title">我的券包与卡券</text>
						<text class="legacy-summary">{{legacySummary}}</text>
					</view>
					<view class="flex items-center">
						<text class="legacy-action">{{showLegacyCards ? '收起' : '展开'}}</text>
						<image src="/static/icons/chevron-down.png" class="legacy-arrow"
							:class="{'legacy-arrow-open': showLegacyCards}"></image>
					</view>
				</view>
			</view>

			<view v-show="showLegacyCards">
			<view v-if="groupCard.length==0&&groupShareCard.length==0" class="px-5">
				<view class="py-3 flex justify-center items-center " style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-1/2 font-semibold text-[28rpx] text-[#584219]">组合券包</view>
					<view class="w-1/2 text-right text-[26rpx] text-[#8A6A40]" @click="go_page_new(0,'')">您还没有购买fu翁卡</view>
				</view>
				<view>
					<view class="flex justify-center pt-10">
						<image @click="go_page_new(0,'')" mode="widthFix" class="w-[200rpx] h-[160rpx]" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png"></image>
					</view>
					<view @click="go_page_new(0,'')" class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">这里空空如也</view>
				</view>
			</view>

			<!-- 组合券自己的卡 -->
			<view v-for="(item,index) in groupCard" :key="index" class="px-5 pb-2 ">
				<view class="py-3 flex justify-center items-center " style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-1/2 font-semibold text-[28rpx] text-[#584219]">组合券包</view>
					<view class="w-1/2 text-right text-[26rpx] text-[#8A6A40]">{{(item.userCount!=0)?'已使用':'未使用'}}
					</view>
				</view>

				<!-- 有组合券时展示 -->
				<view>
					<view class="w-full pt-3 pb-2">
						<image mode="widthFix" style="width: 100%;"
							:src="item.cardimage||'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260130/dd9fa990-b96a-410a-be54-1c0f6b92b936(._.)券种 (7).png'">
						</image>
					</view>
					<view class="flex justify-center items-center text-[#584219]">
						<view class="w-1/2 font-semibold text-[28rpx] " style="font-family: SourceHanSerifSC;">
							{{item.product.title}}
						</view>
						<view class="w-1/2 text-right">
							<text class="text-[#584219] text-[28rpx] ">{{item.amount}}元/</text>
							<text class="text-[24rpx]">{{item.allCount*30}}mins</text>
						</view>
					</view>
					<view v-if="item.userCount!=0"
						class="flex justify-center items-center text-[#584219] pt-2 pb-1 font-semibold">
						<view class="w-1/2  text-[28rpx] ">
							<text>已使用{{item.userCount}}/共{{item.allCount}}张</text>
						</view>
						<view class="w-1/2 justify-end items-center flex" @click="openCardList(index)">
							<text class="text-[#584219] text-[28rpx] ">{{item.displayStatuName}} &nbsp;</text>
							<image src="/static/icons/chevron-down.png" class="h-[28rpx] w-[28rpx]"></image>
						</view>
					</view>
					<view v-if="item.displayStatu">
						<view style="display: block;"> <!-- 组合包里的单券卡 -->
							<view v-for="itemcard in item.customerCouponList" :key="index"
								class="w-full rounded-lg  mt-2 px-3 pt-4 pb-4" :class="itemcard.state==1?'bgColor':'bgColorNotImage'">
								<view class=" pb-3 flex justify-center items-center  text-[36rpx] text-[#584219]">
									<view class="w-3/4  font-semibold" style="font-family: SourceHanSerifSC;">[Full愈]一下
										单张券
									</view>
									<view class="w-1/4 font-medium text-right"><!-- {{itemcard.amount}}元 -->
									</view>
								</view>
								<view class="flex justify-center items-center text-[#8A6A40]">
									<view class="w-3/4">
										<view class="pb-1">享受 30mins Full愈时刻</view>
										<view>*可叠加使用</view>
									</view>
									<view class="w-1/4 flex items-center justify-end" @click="go_page_new(1)">
										<button class="text-white " :class="itemcard.state==1?'btnColor':'btnColorNotImage'" style="margin: 0;">去使用</button>
									</view>
								</view>
							</view>
						</view>

						<!-- <view v-if="item.displayStatu" style="display: block;"> 
							<view v-for="(num,index) in item.userCount" :key="index"
								class="w-full rounded-lg bgColorNotImage mt-2 px-3 pt-4 pb-4">
								<view class=" pb-3 flex justify-center items-center  text-[36rpx] text-[#584219]">
									<view class="w-3/4  font-semibold" style="font-family: SourceHanSerifSC;">[Full愈]一下
										单张券
									</view>
									<view class="w-1/4 font-medium text-right">{{num.amount}}元</view>
								</view>
								<view class="flex justify-center items-center text-[#8A6A40]">
									<view class="w-3/4">
										<view class="pb-1">享受 30mins Full愈时刻</view>
										<view>*可叠加使用</view>
									</view>
									<view class="w-1/4 flex items-center justify-end">
										<button class="text-white btnColorNotImage" style="margin: 0;">已使用</button>
									</view>
								</view>
							</view>
						</view> -->
					</view>


					<!-- 好友未领取 可以取消转增 -->
					<view v-if="item.userCount==0" class="flex justify-center items-center text-[#8A6A40] pt-2 pb-1 ">
						<view class="w-1/2  text-[28rpx] ">
							<text>{{(item.userCount!=0)?'已使用':'未使用'}}</text>
						</view>
						<view class="w-1/2  flex justify-end ">
							<button class="bg-[#584219] text-white"
								@click="go_page_new(2,'/pages/mall/buy-card/buy-card-success?topicon=false&orderid='+item.orderId+'&cardtitle='+item.product.title)"
								style="border: 1px solid #584219; margin: 0;">转赠好友</button>
						</view>
					</view>
				</view>
			</view>
			<!-- 分享的卡 -->
			<view v-for="(item,index) in groupShareCard" :key="index" class="px-5">
				<view class="py-3 flex justify-center items-center " style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-1/2 font-semibold text-[28rpx] text-[#584219]">组合券包</view>
					<view class="w-1/2 text-right text-[26rpx] text-[#8A6A40]">{{(item.userCount!=0)?'已使用':'未使用'}}
					</view>
				</view>

				<!-- 有组合券时展示 -->
				<view>
					<view class="w-full pt-3 pb-2">
						<image mode="widthFix" style="width: 100%;"
							:src="item.cardimage||'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260130/dd9fa990-b96a-410a-be54-1c0f6b92b936(._.)券种 (7).png'">
						</image>
					</view>
					<view class="flex justify-center items-center text-[#584219]">
						<view class="w-1/2 font-semibold text-[28rpx] " style="font-family: SourceHanSerifSC;">
							{{item.product.title}}
						</view>
						<view class="w-1/2 text-right">
							<text class="text-[#584219] text-[28rpx] ">{{item.amount}}元/</text>
							<text class="text-[24rpx]">{{item.allCount*30}}mins</text>
						</view>
					</view>

					<!-- 好友未领取 可以取消转增 -->
					<view class="flex justify-center items-center text-[#8A6A40] pt-2 pb-1 ">
						<view class="w-1/2  text-[28rpx] ">
							<text>未使用</text>
						</view>
						<view class="w-1/2  flex justify-end ">
							<button @click="cancelShareCard(item.orderId)"
								style="border: 1px solid #584219; margin: 0;">取消转赠</button>
						</view>
					</view>
				</view>
			</view>

			<!-- 单张券 -->
			<view class="px-5 pt-3">
				<view class="py-3 flex justify-center items-center pt-2 pb-2 "
					style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-1/4 font-semibold text-[28rpx] text-[#584219]">单张券</view>
					<view v-if="singleCard.length>0" class="w-3/4 text-right text-[26rpx] text-[#8A6A40]">
						{{singleCard.length}} 张券 一共可享受
						{{singleCard.length*30}} mins Full愈时刻
					</view>
					<view v-else class="w-3/4 text-right text-[26rpx] text-[#8A6A40]" @click="go_page_new(0,'')">您还没有Full愈券</view>
				</view>
				<!--无单张券-->
				<view v-if="singleCard.length==0">
					<view class="flex justify-center pt-10">
						<image @click="go_page_new(0,'')" mode="widthFix" class="w-[200rpx] h-[160rpx]" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png"></image>
					</view>
					<view @click="go_page_new(0,'')" class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">这里空空如也</view>
				</view>
				<!--有单张券-->
				<view>
					<!-- /* 带有赠券的样式 class 里加active */ -->
					<view v-for="(item,index) in singleCard" :key="index"
						class="w-full rounded-lg bgColor mt-3 px-3 pt-4 pb-4 " :class="item.type!=0?'active':''"
						style="overflow: hidden; ">
						<view class=" pb-3 flex justify-center items-center  text-[36rpx] text-[#584219]">
							<view class="w-3/4  font-semibold" style="font-family: SourceHanSerifSC;">[Full愈]一下 单张券
							</view>
							<view class="w-1/4 font-medium text-right"><!-- {{item.amount}}元 --></view>
						</view>
						<view class="flex justify-center items-center text-[#8A6A40]">
							<view class="w-3/4">
								<view class="pb-1">享受 30mins Full愈时刻</view>
								<view>*可叠加使用</view>
							</view>
							<view class="w-1/4 flex items-center justify-end" @click="go_page_new(1)">
								<button class="text-white btnColor" style="margin: 0;">去使用</button>
							</view>
						</view>
					</view>
				</view>
			</view>


			<!-- 失效券，好友已领取的券 -->
			<view class="px-5 pt-3">
				<view class="py-3  flex justify-center items-center pt-2 pb-2 "
					style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-full font-semibold  text-[28rpx] ">
						<text>失效券</text>
					</view>
					<!-- <view class="w-1/2 justify-end items-center flex">
					<text class="text-[#584219] text-[28rpx] ">收起&nbsp;</text>
					<image src="/static/icons/chevron-down.png" class="h-[28rpx] w-[28rpx]"></image>
				</view> -->
				</view>
				<!--无券-->
				<view v-if="invalidityGroupCard.length==0">
					<view class="flex justify-center pt-10">
						<image mode="widthFix" class="w-[200rpx] h-[160rpx]" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png"></image>
					</view>
					<view class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">这里空空如也</view>
				</view>
				
				<view v-for="(item,index) in invalidityGroupCard" :key="index">
					<view class="w-full pt-3 pb-2">
						<image mode="widthFix" style="width: 100%;"
							:src="item.cardimage||'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260130/dd9fa990-b96a-410a-be54-1c0f6b92b936(._.)券种 (7).png'">
						</image>
					</view>
					<view class="flex justify-center items-center text-[#584219]">
						<view class="w-1/2 font-semibold text-[28rpx] " style="font-family: SourceHanSerifSC;">
							{{item.product.title}}
						</view>
						<view class="w-1/2 text-right">
							<text class="text-[#584219] text-[28rpx] ">{{item.amount}}元/</text>
							<text class="text-[24rpx]">{{item.allCount*30}}mins</text>
						</view>
					</view>
					<view class="flex justify-center items-center text-[#8A6A40] pt-2 pb-1 ">
						<view class="w-1/2  text-[28rpx] ">
							<text>{{item.userCount>0?'已使用':'未使用'}}</text>
						</view>
						<view class="w-1/2 flex justify-end">
							<button  class="btnColorNotImage" style=" margin: 0;">好友已领取</button>
						</view>
					</view>
				</view>
			</view>
		</view>
		</view>
		<CustomTabBar :selected="1" :list="tabBarList" />
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
		reactive,
		computed,
		nextTick,
		onBeforeUnmount,
		onMounted,
		getCurrentInstance
	} from 'vue'
	import CustomTabBar from '../../../components/CustomTabBar.vue';
	import TopTitleNotBack from '../../../components/TopTitleNotBack.vue';
	import customerCouponApi from '../../../api/customerCoupon'
	import orderApi from "../../../api/order";
	import memberCardApi from '../../../api/memberCard'
	import CouponNoticePanel from '../../../components/CouponNoticePanel.vue'
	import cookie from '../../../utils/cookieUtil'
	const noticePanel = ref(null)
	const noticePanelKey = ref(0)
	const noticeLoggedIn = ref(false)
	const noticeAutoExpand = ref(false)
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

	function submittest() {
		console.log("-----");
	}
	const tabs = ref([{
			name: '购券',
			status: '0'
		},
		{
			name: '我的卡券',
			status: '3'
		}
	]);
	// 当前激活的标签页
	const activeTab = ref(1);
	const fristIsShow = ref(true)
	const twoIsShow = ref(true)
	const groupCard = ref([])
	const groupShareCard = ref([])
	const singleCard = ref([])
	const invalidityGroupCard = ref([])
	const invaliditySingleCard = ref([])
	const memberCardInfo = ref({})
	const showLegacyCards = ref(true)
	const legacyTouched = ref(false)
	const legacySummary = computed(() => {
		const parts = []
		if (groupCard.value.length) parts.push(`组合券包 ${groupCard.value.length}`)
		if (groupShareCard.value.length) parts.push(`待领取 ${groupShareCard.value.length}`)
		if (singleCard.value.length) parts.push(`单张券 ${singleCard.value.length}`)
		if (invalidityGroupCard.value.length) parts.push(`失效 ${invalidityGroupCard.value.length}`)
		return parts.length ? parts.join(' · ') : '暂无其他卡券'
	})
	const toggleLegacyCards = () => {
		legacyTouched.value = true
		showLegacyCards.value = !showLegacyCards.value
	}
	onShow(() => {
		noticeLoggedIn.value = !!cookie.getToken()
		//首页到期提醒框进入时直接展开提醒列表
		const expandNotice = uni.getStorageSync('couponNoticeExpand')
		if (expandNotice) {
			uni.removeStorageSync('couponNoticeExpand')
			noticeAutoExpand.value = true
		} else {
			noticeAutoExpand.value = false
		}
		noticePanelKey.value++
		nextTick(() => noticePanel.value?.refresh())
		console.log("-----------")
		uni.showLoading({
			title: '加载中...'
		});
		//获取组合券包
		getGroupCard()
		//获取单张券
		getSingleCard()
		//获取组合失效券
		getInvalidityGroupCard()
		//getInvaliditySingleCard()
		fetchMemberCard()
		console.log("------------")
		uni.hideLoading()
	})

	const fetchMemberCard = async () => {
		try {
			const data = await memberCardApi.info()
			memberCardInfo.value = data || {}
		} catch (e) {
			memberCardInfo.value = {}
		}
		// 有生效中的会员卡时，其他卡券默认收起，突出会员卡权益
		if (!legacyTouched.value) {
			const state = memberCardInfo.value.state
			showLegacyCards.value = !(state === 'active' || state === 'expiring' || state === 'pending')
		}
	}
	const goMemberCard = () => {
		uni.navigateTo({
			url: '/pages/user/brand-member/brand-member'
		})
	}
	//获取组合券包
	const getGroupCard = async () => {
		//groupCard自己的
		let dataList = await customerCouponApi.getGroupCard(1) //1标识未使用，0标识已使用
		groupCard.value = dataList
		console.log(dataList)
		//分享出去的
		let dataListShare = await customerCouponApi.getShareGroupCard(0) //1标识已领取，0标识待领取
		groupShareCard.value = dataListShare
	}
	//获取单张有用的券
	const getSingleCard = async () => {
		let dataList = await customerCouponApi.getSingleCard(1)
		singleCard.value = dataList
	}
	//获取组合失效券
	const getInvalidityGroupCard = async () => {
		let dataListShare = await customerCouponApi.getShareGroupCard(1) //1标识已领取，0标识待领取
		console.log(dataListShare)
		invalidityGroupCard.value=dataListShare
	}
	const getInvaliditySingleCard = async () => {
		//invaliditySingleCard
	}
	//取消分享
	const cancelShareCard = (orderId) => {
		uni.showModal({
			title: '提示',
			content: '确定要取消分享吗？',
			confirmText: "确定",
			cancelText: "取消",
			success: async (res) => {
				if (res.confirm) {
					await orderApi.cancelShareCard(orderId)
					//获取组合券包
					getGroupCard()
					uni.showLoading({
						title: "取消成功！"
					})
					setTimeout(function() {
						uni.hideLoading();
					}, 500);
				}
			}
		});
	}
	//打开某个组合券的单卡列表
	const openCardList = (index) => {
		if (groupCard.value[index].displayStatu) {
			groupCard.value[index].displayStatu = false
			groupCard.value[index].displayStatuName = '展开'
		} else {
			groupCard.value[index].displayStatu = true
			groupCard.value[index].displayStatuName = '收起'
		}
	}
	const customBar = ref(0)
	const statusBar = ref(0)
	onLoad((options) => {
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
				customBar.value = custom.bottom + custom.top - e.statusBarHeight
				statusBar.value = e.statusBarHeight + 10
				// #endif
			}
		})

	});
	const go_page_new = (index, path) => {
		console.log(index)
		if (index == 0) {
			uni.switchTab({
				url: '/pages/mall/mall'
			})
		}
		if (index == 1) {
			uni.navigateTo({
				url: '/pages/index/select-project'
			})
		}
		if (index == 2) {
			uni.navigateTo({
				url: path
			})
		}
	}
</script>

<style lang="less" scoped>
	/* 带有赠券的样式 */
	&.active {
		position: relative;

		&::after {
			content: '';
			width: 60rpx;
			height: 30rpx;
			background: url('~@/static/icons/zuanzeng.png') no-repeat center, #FFFFFF;
			background-size: 60rpx 30rpx, cover;
			border-top-left-radius: 4upx;
			border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #584219;
		}
	}

	.bgColor {
		border-radius: 8px;
		border: 3rpx solid #584219;
		background: linear-gradient(98deg, #FCF9F6 9.12%, #FFF 26.67%, #F6EFE9 48.71%, #FFF 65.81%, #F6EFE9 77.96%, #FCF9F6 88.3%, #FFF 100%);
	}

	/* /已使用卡券背景样式 */
	.bgColorNotImage {
		border-radius: 8px;
		border: 3rpx solid #C5B69D;
		background-color: white;
	}

	/* /已使用按钮的样式 */
	.btnColorNotImage {
		background-color: white !important;
		color: #DED9D1 !important;
		border: 2rpx solid #DED9D1 !important;
	}

	/* /按钮的样式 */
	.btnColor {
		background: linear-gradient(277deg, #584219 12.32%, #80693C 57.28%, #584219 80.2%, #584219 96.95%);
	}

	/* 顶部选项卡样式 */

	.tab-nav {
		display: flex;
		background-color: #fff;
		padding: 0 32upx;
		border-bottom: 2upx solid #f0f0f0;

		.tab-item {
			flex: 1;
			text-align: center;
			padding: 24upx 0;
			font-size: 30rpx;

			position: relative;
			transition: color 0.3s;

			&.active1 {
				font-size: 30upx;
				color: #584219;
				font-weight: bold;

				&::after {
					content: '';
					position: absolute;
					bottom: 0;
					left: 50%;
					transform: translateX(-50%);
					width: 35upx;
					height: 4upx;
					background-color: #584219;
					border-radius: 2upx;
				}
			}
		}
	}

	.member-strip {
		background: linear-gradient(150deg, #6B5326 0%, #584219 100%);
		border-radius: 16rpx;
		padding: 28rpx 28rpx;
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: #F3E9D8;
	}

	.member-strip-title {
		font-size: 30rpx;
		font-weight: 600;
		letter-spacing: 0.06em;
		font-family: SourceHanSerifSC;
	}

	.member-strip-sub {
		margin-top: 8rpx;
		font-size: 22rpx;
		color: rgba(243, 233, 216, 0.74);
		letter-spacing: 0.05em;
	}

	.member-strip-btn {
		padding: 8rpx 22rpx;
		border-radius: 999rpx;
		background: #E4C892;
		color: #4A3714;
		font-size: 22rpx;
		font-weight: 600;
		letter-spacing: 0.06em;
	}

	.legacy-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20rpx 0 16rpx;
		border-bottom: 1px solid #E6E2DC;
	}

	.legacy-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.05em;
		font-family: SourceHanSerifSC;
	}

	.legacy-summary {
		margin-left: 14rpx;
		font-size: 22rpx;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.legacy-action {
		font-size: 24rpx;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.legacy-arrow {
		width: 26rpx;
		height: 26rpx;
		margin-left: 8rpx;
		transition: transform 0.2s ease;
	}

	.legacy-arrow-open {
		transform: rotate(180deg);
	}
</style>