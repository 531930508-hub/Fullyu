<template>
	<view class="min-h-screen  bg-[#F6F4F2] pb-[200rpx]">
		<TopTitleNotBack></TopTitleNotBack>
		<view class="tab-nav" :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">
			<view :class="['tab-item', { active: activeTab === 'buy' }]" @click="go_page_new('buy')">
				购券
			</view>
			<view  :class="['tab-item', { active: activeTab === 'mine' }]" @click="go_page_new('mine')"><!-- v-if="token" -->
				我的卡券
			</view>
		</view>
		<view class="text-[#584219]" :style="{marginTop:customBar+'px'}">
			<view class="px-5 text-[30rpx]">
				<!-- Full愈年卡 · 品牌通用会员 -->
				<view class="member-hero mt-3" @click="goMemberCard">
					<view class="member-hero-top">
						<view>
							<view class="member-hero-title">{{memberCardConfig.cardName || 'Full愈年卡'}}</view>
							<view class="member-hero-sub">{{memberCardConfig.validDays || 365}} 天 · 时叙、在场、轻疗三店通用</view>
						</view>
						<view class="member-hero-price">
							<text class="member-hero-price-num">{{memberCardConfig.price || 299}}</text>
							<text class="member-hero-price-unit"> 元起</text>
						</view>
					</view>
					<view class="member-hero-rates">
						<view class="member-hero-rate">
							<text class="member-hero-rate-num">{{memberCardConfig.advanceDiscountText || '7.8 折'}}</text>
							<text class="member-hero-rate-label">轻疗 · 提前预约</text>
						</view>
						<view class="member-hero-divider"></view>
						<view class="member-hero-rate">
							<text class="member-hero-rate-num">{{memberCardConfig.sameDayDiscountText || '8.8 折'}}</text>
							<text class="member-hero-rate-label">轻疗 · 当日预约</text>
						</view>
					</view>
					<view class="member-hero-foot">
						<view class="member-hero-status">
							<text v-if="memberCardState === 'active' || memberCardState === 'expiring'">年卡生效中 · 剩余 {{memberCardInfo.remainingDays}} 天 · 三店通用</text>
							<text v-else-if="memberCardState === 'pending'">续费已排期，到期后自动续期</text>
							<text v-else-if="memberCardState === 'expired'">年卡已到期，续费继续享三店会员价</text>
							<text v-else>开通年卡，月卡 / 年卡可选</text>
						</view>
						<view class="member-hero-btn">{{memberCardState === 'none' || memberCardState === 'expired' ? '去开通' : '查看'}}</view>
					</view>
				</view>

				<!-- 其他卡券：原有活动券包 / 组合券包 / 储值卡，降级折叠 -->
				<view class="other-head" @click="showOtherCards = !showOtherCards">
					<text class="font-semibold">其他卡券</text>
					<view class="other-head-right">
						<text>活动券包 / 组合券包 / 储值卡</text>
						<text class="other-arrow">{{showOtherCards ? '收起' : '展开'}}</text>
					</view>
				</view>

				<view v-show="showOtherCards">
				<view v-if="productOther.length>0" class="py-3 font-semibold" style="border-bottom: 1px solid #E6E2DC;">
					购买活动券包
				</view>
				<view v-for="(data,index) in productOther" @click="go_page_notbar(data.id)" :key="index"
					class="mt-3 rounded-lg bgColor5 " style="overflow: hidden; ">
					<view class="px-3 pt-4 pb-1">
						<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
							style="font-family: SourceHanSerifSC;">
							<view class="w-1/2 flex">
								<view class="pt-1">{{data.title}} </view>
								<image style="margin-left: -30rpx;margin-top: -12rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class="w-1/2 flex items-center justify-end">
								<text>{{data.amount}}元</text>
								<text class="text-[26rpx]"></text>
							</view>
						</view>
						<view class="flex   mt-1">
							<view class="w-4/5">
								<view v-for="(item,index) in data.explainArray" :key="index"
									class="w-full text-[24rpx] flex " style="white-space:pre-wrap;">
									<view style="width: 5%;">
										<text class=" rounded-full"
											style="font-weight: bolder;font-size: 28rpx;">·</text>
									</view>
									<view style="width: 95%;">{{item}}
									</view>
								</view>

							</view>
							<view class="w-1/5  flex justify-end pr-3 h-full">
								<text class="text-[#8A6A40] text-[24rpx] "
									style="text-decoration-line: line-through;">原{{data.originalAmount}}元</text>
							</view>
						</view>
					</view>
					<view class="w-full text-[24rpx] flex items-center px-3  pb-3">
						<view class="w-3/4"><text> {{data.comment}}</text></view>
						<view  class="py-1 w-1/4 text-[24rpx] rounded-lg"
							style="border: 2rpx solid; #8A6A40">
							<text class="px-3 py-1">了解详情</text>
						</view>
					</view>
				</view>

				<view class="py-3 font-semibold" style="border-bottom: 1px solid #E6E2DC;">
					购买组合券包
				</view>
				
				
				<!-- <view v-for="(data,index) in productNewList" @click="go_page_notbar(data.id)" 
					class="mt-3 rounded-lg  " 
					:class="{bgColor1:data.id==10,active1:data.id==10,
					bgColor2:data.id==12,active2:data.id==12,
					bgColor3:data.id==11,active3:data.id==11,
					bgColor4:data.id==3,active4:data.id==3,
					bgColor5:data.id==2,active5:data.id==2}"
					  style="overflow: hidden; ">
					<view class="px-3 pt-4 pb-1">
						<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
							style="font-family: SourceHanSerifSC;">
							<view class="w-1/2 flex">
								<view class="pt-1">{{data.title}} </view>
								<image style="margin-left: -30rpx;margin-top: -12rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class="w-1/2 flex items-center justify-end">
								<text>{{data.amount}}元</text>
								<text class="text-[26rpx]">/180mins</text>
							</view>
						</view>
						<view class="flex   mt-1">
							<view style="width: 75%;">
								<view v-for="(item,index) in data.explainArray" :key="index"
									class="w-full text-[24rpx] flex " style="white-space:pre-wrap;">
									<view style="width: 5%;">
										<text class=" rounded-full"
											style="font-weight: bolder;font-size: 28rpx;">·</text>
									</view>
									<view style="width: 95%;">{{item}}
									</view>
								</view>
				
							</view>
							<view style="width: 25%;" class=" flex justify-end pr-3 h-full">
								<text class="text-[#8A6A40] text-[24rpx] "
									style="text-decoration-line: line-through;">原{{data.originalAmount}}元</text>
							</view>
						</view>
					</view>
					<view class="w-full text-[24rpx] flex items-center px-3  pb-3">
						<view class="w-3/4"><text> {{data.comment}}</text> </view>
						<view class="py-1 w-1/4 text-[24rpx] rounded-lg" style="border: 2rpx solid; #8A6A40">
							<text  class="px-3 py-1">了解详情</text>
						</view>
					</view>
				</view> -->


				<!-- class="mt-3 rounded-lg bgColor5 active5" -->
				<view @click="go_page_notbar(productFive[0].id)" v-if="productFive.length>0"
					class="mt-3 rounded-lg bgColor5 active5" style="overflow: hidden; ">
					<view class="px-3 pt-4 pb-1">
						<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
							style="font-family: SourceHanSerifSC;">
							<view class="w-1/2 flex">
								<view class="pt-1">{{productFive[0].title}} </view>
								<image style="margin-left: -30rpx;margin-top: -12rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class="w-1/2 flex items-center justify-end">
								<text>{{productFive[0].amount}}元</text>
								<text class="text-[26rpx]">/90mins</text>
							</view>
						</view>
						<view class="flex   mt-1">
							<view style="width: 75%;">
								<view v-for="(item,index) in productFive[0].explainArray" :key="index"
									class="w-full text-[24rpx] flex " style="white-space:pre-wrap;">
									<view style="width: 5%;">
										<text class=" rounded-full"
											style="font-weight: bolder;font-size: 28rpx;">·</text>
									</view>
									<view style="width: 95%;">{{item}}
									</view>
								</view>
							</view>
							<view style="width: 25%;" class="flex justify-end pr-3 h-full">
								<text class="text-[#8A6A40] text-[24rpx] "
									style="text-decoration-line: line-through;">原{{productFive[0].originalAmount}}元</text>
							</view>
						</view>
					</view>
					<view class="w-full text-[24rpx] flex items-center px-3  pb-3">
						<view class="w-3/4"><text> {{productFive[0].comment}}</text> </view>
						<view class="py-1 w-1/4 text-[24rpx] rounded-lg" style="border: 2rpx solid; #8A6A40">
							<text  class="px-3 py-1">了解详情</text>
						</view>
					</view>
				</view>



				<view @click="go_page_notbar(productOne[0].id)" v-if="productOne.length>0"
					class="mt-3 rounded-lg bgColor4 active4" style="overflow: hidden; ">
					<view class="px-3 pt-4 pb-1">
						<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
							style="font-family: SourceHanSerifSC;">
							<view class="w-1/2 flex">
								<view class="pt-1">{{productOne[0].title}} </view>
								<image style="margin-left: -30rpx;margin-top: -12rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class="w-1/2 flex items-center justify-end">
								<text>{{productOne[0].amount}}元</text>
								<text class="text-[26rpx]">/180mins</text>
							</view>
						</view>
						<view class="flex   mt-1">
							<view style="width: 75%;">
								<view v-for="(item,index) in productOne[0].explainArray" :key="index"
									class="w-full text-[24rpx] flex " style="white-space:pre-wrap;">
									<view style="width: 5%;">
										<text class=" rounded-full"
											style="font-weight: bolder;font-size: 28rpx;">·</text>
									</view>
									<view style="width: 95%;">{{item}}
									</view>
								</view>

							</view>
							<view style="width: 25%;" class=" flex justify-end pr-3 h-full">
								<text class="text-[#8A6A40] text-[24rpx] "
									style="text-decoration-line: line-through;">原{{productOne[0].originalAmount}}元</text>
							</view>
						</view>
					</view>
					<view class="w-full text-[24rpx] flex items-center px-3  pb-3">
						<view class="w-3/4"><text> {{productOne[0].comment}}</text> </view>
						<view class="py-1 w-1/4 text-[24rpx] rounded-lg" style="border: 2rpx solid; #8A6A40">
							<text  class="px-3 py-1">了解详情</text>
						</view>
					</view>
				</view>

				<view @click="go_page_notbar(productTwo[0].id)" v-if="productTwo.length>0"
					class="mt-3 rounded-lg bgColor2 active2" style="overflow: hidden; ">
					<view class="px-3 pt-4 pb-1">
						<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
							style="font-family: SourceHanSerifSC;">
							<view class="w-1/2 flex">
								<view class="pt-1">{{productTwo[0].title}} </view>
								<image style="margin-left: -30rpx;margin-top: -12rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class="w-1/2 flex items-center justify-end">
								<text>{{productTwo[0].amount}}元</text>
								<text class="text-[26rpx]">/360mins</text>
							</view>
						</view>
						<view class="flex   mt-1">
							<view style="width: 75%;">
								<view v-for="(item,index) in productTwo[0].explainArray" :key="index"
									class="w-full text-[24rpx] flex " style="white-space:pre-wrap;">
									<view style="width: 5%;">
										<text class=" rounded-full"
											style="font-weight: bolder;font-size: 28rpx;">·</text>
									</view>
									<view style="width: 95%;">{{item}}
									</view>
								</view>
							</view>
							<view style="width: 25%;" class="flex justify-end pr-3 h-full">
								<text class="text-[#8A6A40] text-[24rpx] "
									style="text-decoration-line: line-through;">原{{productTwo[0].originalAmount}}元</text>
							</view>
						</view>
					</view>
					<view class="w-full text-[24rpx] flex items-center px-3  pb-3">
						<view class="w-3/4"><text> {{productTwo[0].comment}}</text> </view>
						<view class="py-1 w-1/4 text-[24rpx] rounded-lg" style="border: 2rpx solid; #8A6A40">
							<text  class="px-3 py-1">了解详情</text>
						</view>
					</view>
				</view>


				<view @click="go_page_notbar(productThree[0].id)" v-if="productThree.length>0"
					class="mt-3 rounded-lg bgColor1 active1" style="overflow: hidden; ">
					<view class="px-3 pt-4 pb-1">
						<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
							style="font-family: SourceHanSerifSC;">
							<view class="w-1/2 flex">
								<view class="pt-1" style="">{{productThree[0].title}} </view>
								<image style="margin-left: -30rpx;margin-top: -12rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class="w-1/2 flex items-center justify-end">
								<text>{{productThree[0].amount}}元</text>
								<text class="text-[26rpx]">/720mins</text>
							</view>
						</view>
						<view class="flex   mt-1">
							<view style="width: 75%;">
								<view v-for="(item,index) in productThree[0].explainArray" :key="index"
									class="w-full text-[24rpx] flex " style="white-space:pre-wrap;">
									<view style="width: 5%;">
										<text class=" rounded-full"
											style="font-weight: bolder;font-size: 28rpx;">·</text>
									</view>
									<view style="width: 95%;">{{item}}
									</view>
								</view>
							</view>
							<view style="width: 25%;" class="flex justify-end pr-3 h-full">
								<text class="text-[#8A6A40] text-[24rpx] "
									style="text-decoration-line: line-through;">原{{productThree[0].originalAmount}}元</text>
							</view>
						</view>
					</view>
					<view class="w-full text-[24rpx] flex items-center px-3  pb-3">
						<view class="w-3/4"><text> {{productThree[0].comment}}</text> </view>
						<view class="py-1 w-1/4 text-[24rpx] rounded-lg" style="border: 2rpx solid; #8A6A40">
							<text  class="px-3 py-1">了解详情</text>
						</view>
					</view>
				</view>



				<view @click="go_page_notbar(productFour[0].id)" v-if="productFour.length>0"
					class="mt-3 rounded-lg bgColor3 active3" style="overflow: hidden; ">
					<view class="px-3 pt-4 pb-1">
						<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
							style="font-family: SourceHanSerifSC;">
							<view class="w-1/2 flex">
								<view class="pt-1" style="">{{productFour[0].title}} </view>
								<image style="margin-left: -30rpx;margin-top: -12rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class="w-1/2 flex items-center justify-end">
								<text>{{productFour[0].amount}}元</text>
								<text class="text-[26rpx]">/1800mins</text>
							</view>
						</view>
						<view class="flex   mt-1">
							<view style="width: 75%;">
								<view v-for="(item,index) in productFour[0].explainArray" :key="index"
									class="w-full text-[24rpx] flex " style="white-space:pre-wrap;">
									<view style="width: 5%;">
										<text class=" rounded-full"
											style="font-weight: bolder;font-size: 28rpx;">·</text>
									</view>
									<view style="width: 95%;">{{item}}
									</view>
								</view>
							</view>
							<view style="width: 25%;" class="flex justify-end pr-3 h-full">
								<text class="text-[#8A6A40] text-[24rpx] "
									style="text-decoration-line: line-through;">原{{productFour[0].originalAmount}}元</text>
							</view>
						</view>
					</view>
					<view class="w-full text-[24rpx] flex items-center px-3  pb-3">
						<view class="w-3/4"><text> {{productFour[0].comment}}</text> </view>
						<view class="py-1 w-1/4 text-[24rpx] rounded-lg" style="border: 2rpx solid; #8A6A40">
							<text  class="px-3 py-1">了解详情</text>
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
		toRefs,
		reactive,
		computed,
		nextTick,
		onBeforeUnmount,
		onMounted,
		getCurrentInstance
	} from 'vue'
	import CustomTabBar from '../../components/CustomTabBar.vue';
	import TopTitleNotBack from '../../components/TopTitleNotBack.vue';
	import cookie from "../../utils/cookieUtil"
	import productApi from "../../api/product"
	import customerApi from '../../api/customer'
	import memberCardApi from '../../api/memberCard'

	const tabs = ref([{
			name: '购券',
			status: '1'
		},
		{
			name: '我的卡券',
			status: '2'
		}
	]);

	const {
		proxy
	} = getCurrentInstance()
	const vm = proxy

	//token
	const token = ref(cookie.getToken())

	//请求参数
	const params = reactive({
		page: 1,
		size: 20
	})

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

	// 当前激活的标签页
	const activeTab = ref('buy');
	// 选中的券种
	const selectedCoupon = ref(-1);
	//券包
	const productData = reactive({
		productList: [],
		productTotal: 0
	})
	const {
		productList
	} = toRefs(productData)

	const customBar = ref(0)
	const statusBar = ref(0)
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
				statusBar.value = e.statusBarHeight + 10
				// #endif
			}
		})
		//获取组合券包
		//init(options)
		//获取活动券包，放到onshow里
	});
	onShow(() => {
		fetchProductData()
		fetchMemberCard()
	})

	// Full愈年卡
	const memberCardConfig = ref({})
	const memberCardInfo = ref({})
	const showOtherCards = ref(false)
	const memberCardState = computed(() => memberCardInfo.value.state || 'none')

	const fetchMemberCard = async () => {
		try {
			const data = await memberCardApi.info()
			memberCardInfo.value = data || {}
			if (data && data.cardName) {
				memberCardConfig.value = data
			}
		} catch (e) {
			memberCardInfo.value = {}
		}
	}

	const goMemberCard = () => {
		uni.navigateTo({
			url: '/pages/user/brand-member/brand-member'
		})
	}
	const activityCode = ref(null)
	const init = async (options) => {
		if (options) {
			const {
				scene,
				tab
			} = options
			// scene值为动态小程序码分享的
			if (scene && token.value) {
				vm.$Cache.put('activityCode', scene)
				await customerApi.saveCustomerTagByActivityCode(scene)
				vm.$Cache.remove('activityCode')
			} else if (scene) {
				activityCode.value = scene
				vm.$Cache.put('activityCode', scene)
			}
			/* if (tab) {
				switchTab(tab)
			} else {
				switchTab('buy')
			} */
		} else {
			//switchTab('buy')
		}
	}

	const go_page_new = (index) => {
		if (checkLogin()) {
			if (index == 'mine') {
				uni.switchTab({
					url: '/pages/mall/my-card/my-card'
				})
			}
		}
	}
	const go_page_notbar = (productid) => {
		/* if (checkLogin()) { */
			uni.navigateTo({
				url: '/pages/mall/detail?productid=' + productid
			})
		/* } */
	}
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
	const productOne = ref([])
	const productTwo = ref([])
	const productThree = ref([])
	const productFour = ref([])
	const productOther = ref([])
	const productFive = ref([])
	const productActive = ref([])
	const productNewList=ref([])
	//获取购券商品
	const fetchProductData = async () => {
		const productList = await productApi.list({
			...params,
			type: 1,
			state: 1,
			order: 'sequence',
			activityCode: activityCode.value
		})
		productData.productList = productList || []
		console.log(productList)
		if (!productData.productList.length) {
			return
		}
		productOne.value = productList.filter(t => {
			return t.id == 3
		});
		productTwo.value = productList.filter(t => {
			return t.id == 12
		});
		productThree.value = productList.filter(t => {
			return t.id == 10
		});
		productFour.value = productList.filter(t => {
			return t.id == 11
		});
		productFive.value = productList.filter(t => {
			return t.id == 2
		});
		productNewList.value=productList.filter(t => {
			return t.id == 2||t.id == 11||t.id == 10||t.id == 12||t.id == 3
		});
		productOther.value = productList.filter(t => {
			return t.id != 11 && t.id != 10 && t.id != 12 && t.id != 3 && t.id != 2
		});

		//selectCoupon(productData.productList[0])
	}
</script>

<style lang="less" scoped>
	.bgColor {
		border-radius: 8px;
		border: 2px solid #584219;
		background: linear-gradient(98deg, #FCF9F6 9.12%, #FFF 26.67%, #F6EFE9 48.71%, #FFF 65.81%, #F6EFE9 77.96%, #FCF9F6 88.3%, #FFF 100%);
	}

	/* /已使用卡券背景样式 */
	.bgColorNotImage {
		border-radius: 8px;
		border: 2px solid #C5B69D;
		background-color: white;
	}

	/* /已使用按钮的样式 */
	.btnColorNotImage {
		background-color: white !important;
		color: #DED9D1 !important;
		border: 1px solid #DED9D1 !important;
	}

	/* /按钮的样式 */
	.btnColor {
		background: linear-gradient(277deg, #584219 12.32%, #80693C 57.28%, #584219 80.2%, #584219 96.95%);
	}

	// 标签页导航
	// 标签页导航
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

			&.active {
				font-size: 30rpx;
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

	/* 购卡样式 */
	&.active1 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgColor1.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor1 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #D0D6E3;
		//background: linear-gradient(98deg, #FCF9F6 9.12%, #FFF 26.67%, #F6EFE9 48.71%, #FFF 65.81%, #F6EFE9 77.96%, #FCF9F6 88.3%, #FFF 100%);
		background: linear-gradient(110deg, rgba(176, 183, 198, 0.16) 26.94%, rgba(115, 126, 144, 0.16) 38.35%, rgba(208, 214, 227, 0.16) 53.77%, rgba(115, 126, 144, 0.16) 70.88%), #FFF;
	}

	.bgcolordown1 {
		color: #72767D;
		background: linear-gradient(305deg, #737E90 -60.09%, #D0D6E3 58.6%), #FFF;
	}

	&.active2 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgColor2.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor2 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #BEA467;
		background: linear-gradient(290deg, rgba(161, 131, 65, 0.16) 28.32%, rgba(247, 228, 181, 0.16) 41.77%, rgba(194, 168, 110, 0.16) 51.41%, rgba(238, 219, 166, 0.16) 58.04%, rgba(161, 131, 65, 0.16) 68.68%), #FFF;
	}

	.bgcolordown2 {
		background: linear-gradient(308deg, #A18341 44.66%, #EEDBA6 105.62%), #FFF;
	}

	&.active3 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgColor3.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor3 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #CDB4D1;
		background: linear-gradient(0deg, rgba(208, 188, 255, 0.16) 0%, rgba(208, 188, 255, 0.16) 100%), #FFF;
	}

	.bgcolordown3 {
		background: var(--ffffff-2-paints, linear-gradient(308deg, #96839C 44.66%, #DDC3E0 105.62%), #FFF);
	}

	&.active4 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgcolor4.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor4 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #82494A;
		background: linear-gradient(278deg, rgba(88, 25, 26, 0.20) 4.44%, rgba(235, 180, 181, 0.20) 100%), #FFF;
	}

	.bgcolordown4 {
		background: var(--ffffff-2-paints, linear-gradient(308deg, #96839C 44.66%, #DDC3E0 105.62%), #FFF);
	}


	&.active5 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgcolor5.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor5 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #82494A;
		background: linear-gradient(286deg, rgba(87, 136, 189, 0.20) 48.65%, rgba(195, 218, 224, 0.20) 84.69%), #FFF;
	}

	.bgcolordown5 {
		background: var(--ffffff-2-paints, linear-gradient(308deg, #96839C 44.66%, #DDC3E0 105.62%), #FFF);
	}

	/* Full愈年卡 */
	.member-hero {
		background: linear-gradient(150deg, #6B5326 0%, #584219 52%, #4A3714 100%);
		border-radius: 20rpx;
		padding: 32rpx 30rpx 26rpx;
		color: #F3E9D8;
		box-shadow: 0 10rpx 28rpx rgba(88, 66, 25, 0.18);
	}

	.member-hero-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.member-hero-title {
		font-size: 34rpx;
		font-weight: 600;
		letter-spacing: 0.06em;
		font-family: SourceHanSerifSC;
	}

	.member-hero-sub {
		margin-top: 8rpx;
		font-size: 23rpx;
		color: rgba(243, 233, 216, 0.72);
		letter-spacing: 0.05em;
	}

	.member-hero-price {
		display: flex;
		align-items: baseline;
		color: #E4C892;
	}

	.member-hero-price-num {
		font-size: 44rpx;
		font-weight: 600;
	}

	.member-hero-price-unit {
		font-size: 22rpx;
	}

	.member-hero-rates {
		display: flex;
		align-items: center;
		margin-top: 26rpx;
	}

	.member-hero-rate {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.member-hero-rate-num {
		font-size: 48rpx;
		font-weight: 600;
		color: #E4C892;
		letter-spacing: 0.06em;
	}

	.member-hero-rate-label {
		margin-top: 4rpx;
		font-size: 22rpx;
		color: rgba(243, 233, 216, 0.72);
		letter-spacing: 0.12em;
	}

	.member-hero-divider {
		width: 1px;
		height: 60rpx;
		background: rgba(243, 233, 216, 0.24);
	}

	.member-hero-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 22rpx;
		padding-top: 20rpx;
		border-top: 1px solid rgba(243, 233, 216, 0.16);
	}

	.member-hero-status {
		font-size: 22rpx;
		color: rgba(243, 233, 216, 0.78);
		letter-spacing: 0.05em;
	}

	.member-hero-btn {
		padding: 8rpx 22rpx;
		border-radius: 999rpx;
		background: #E4C892;
		color: #4A3714;
		font-size: 22rpx;
		font-weight: 600;
		letter-spacing: 0.06em;
	}

	/* 其他卡券折叠 */
	.other-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 28rpx 0 16rpx;
		margin-top: 8rpx;
		border-bottom: 1px solid #E6E2DC;
	}

	.other-head-right {
		display: flex;
		align-items: center;
		font-size: 22rpx;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.other-arrow {
		margin-left: 12rpx;
		color: #584219;
		font-weight: 600;
	}
</style>