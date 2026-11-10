<template>
	<view class="min-h-screen  bg-[#F6F4F2] ">
		<TopTitle></TopTitle>
		<view class="treatment-record"
			:style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">
			<view class="tab-nav sticky-top">
				<view v-for="(tab, index) in tabs" :key="index" :class="['tab-item', { active: activeTab === index }]"
					@click="switchTab(index)">
					{{ tab.name }}
				</view>
			</view>
			<!-- 记录列表 -->
			<view v-if="DataShowStatus" class="px-5">
				<view class="text-[#584219] flex justify-center h-[100rpx] items-center">
					<view class="w-full flex items-center " @click="showPicker">

						<picker mode="selector" :range="cityData" @change="onCityChange">
							{{morenCity}}
						</picker>
						<image class="w-[28rpx] h-[28rpx]" src="/static/icons/arrow-right.png"></image>
					</view>
					<!-- <view class="w-1/2 flex items-center justify-end">
						<image class="w-[24rpx] h-[24rpx]" src="/static/icons/map-marker-alt-solid.png"></image>
						<text>&nbsp;{{morenStreet}}</text>
					</view> -->
				</view>
				<view v-if="seachStatus" class="record-card">
					<view class="relative flex items-center justify-end">
						<input type="text" placeholder="搜索" @input="onKeyInput" @confirm="seachData"
							class="w-full h-[70rpx] bg-white py-2 px-4 pr-10 rounded-full shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
						<image @click="seachData" class="w-[40rpx] h-[40rpx] absolute mr-4"
							src="/static/icons/seach.png"></image>
					</view>
				</view>

				<!-- 数据列表 -->
				<view v-for="(item,index) in shoplist" :key="index"
					class="text-[#8A6A40] rounded-lg bg-white w-full h-[320rpx] px-4 pt-4 mt-4">
					<view
						class="flex items-center text-[#584219] font-medium text- text-[30rpx] border-b border-[#F0EEEA] pb-3 ">
						<view class="w-4/5"> {{item.name}}</view>
						<view class="w-1/5 flex items-center justify-end"
							@click.stop="exicCollect(item.id,item.busProductId)">
							<image class="w-[35rpx] h-[35rpx]"
								:src="item.busProductId==0?'/static/icons/favorite-therapist.png':'/static/icons/shoucangselect.png'">
							</image>
							<text>&nbsp;收藏</text>
						</view>
					</view>
					<view class="flex justify-center items-center pt-3 ">
						<view class="w-full truncate">{{item.address}}</view>
						<view v-if="hasLocation && distanceText(item)" class="flex items-center shrink-0 ml-2">
							<text v-if="index === 0" class="shop-nearest-tag">最近</text>
							<text class="shop-distance">{{distanceText(item)}}</text>
						</view>
					</view>
					<view class="flex justify-center items-center">
						<view class="w-3/4">
							<view class="mt-3  flex items-center" @click.stop="callMobile(item.mobile)">
								电话：{{item.mobile}}
							</view>
							<view class="mt-3">
								周一到周日 {{item.clockInTime}}-{{item.clockOutTime}}
							</view>
							<!-- <view class="mt-3">
								{{item.printSn}}
							</view> -->
						</view>
						<view class="w-1/4 flex justify-center items-end h-[110rpx]">
							<button class="bg-white" @click="go_page_id(item.id)"
								style="border: 1px solid #584219; margin-left: 47%;margin: 0;">预约</button>
						</view>
					</view>
				</view>

				<!-- 无数据 -->
				<view v-if="notdatadisplay">
					<view class="flex justify-center pt-[300rpx]">
						<image mode="widthFix" class="w-[200rpx] h-[160rpx]"
							src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png"></image>
					</view>
					<view class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">这里空空如也</view>
				</view>
			</view>

			<view v-if="NotDataShowStatus" class="px-5">
				<view class="text-[#584219] flex justify-center h-[100rpx] items-center">
					<view class="w-full flex items-center ">
						<picker mode="selector" :range="cityData" @change="onCityChange">
							<text>上海</text>
						</picker>
						<image class="w-[28rpx] h-[28rpx]" src="/static/icons/arrow-right.png"></image>
					</view>
					<!-- <view class="w-1/2 flex items-center justify-end">
						<image class="w-[24rpx] h-[24rpx]" src="/static/icons/map-marker-alt-solid.png"></image>
						<text>&nbsp;请开启定位</text>
					</view> -->
				</view>

				<!-- 数据列表 -->
				<view class=" w-full h-[800rpx] flex justify-center items-center">
					<image mode="widthFix" class="w-[230rpx]"
						src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/Frame3.png"></image>
				</view>
				<view class="flex justify-center items-center">
					<view @click="openlocation"
						class="text-#584219] rounded-lg text-[28rpx] w-[220rpx] h-[80rpx] flex items-center justify-center"
						style="border: 1rpx solid #584219;">
						开启定位</view>

					<view class="w-3"></view>
					<view
						class="bg-[#584219] rounded-lg text-[#FFFFFF] text-[28rpx] w-[220rpx] h-[80rpx] flex items-center justify-center">
						<picker mode="selector" :range="cityData" @change="onCityChange">
							手动选择
						</picker>

					</view>

				</view>



			</view>



		</view>
	</view>
</template>
<script setup>
	import {
		onLoad,
		onShow
	} from "@dcloudio/uni-app"
	import {
		reactive,
		ref,
		toRefs,
		getCurrentInstance,
		computed
	} from 'vue';
	import TopTitle from '../../../components/TopTitle.vue';
	import cookie from "../../../utils/cookieUtil"
	import shopApi from "../../../api/shop"
	import { distanceText } from "../../../utils/storeSelection"
	const {
		proxy
	} = getCurrentInstance()
	const vm = proxy
	// 标签页数据
	const tabs = ref([{
			name: '推荐门店',
			status: '1'
		},
		{
			name: '所有门店',
			status: '2'
		}
	]);
	// 当前激活的标签页
	const activeTab = ref(0);
	const twoIsShow = ref(true)
	const cityData = ref(['上海']);
	const shoplist = ref([])
	const morenCity = ref('上海')
	const morenStreet = ref('请开启定位')
	const DataShowStatus = ref(false)
	const NotDataShowStatus = ref(false)
	const titleName = ref("")
	const pickerHidden = ref(true)
	const notdatadisplay = ref(false)
	const seachStatus = ref(false)
	const hasLocation = ref(false)
	// 切换标签页
	const switchTab = (index) => {
		seachStatus.value = false
		shoplist.value = []
		if (index == 1) {
			NotDataShowStatus.value = false;
			DataShowStatus.value = true;
			activeTab.value = 1;
			getLocationInfo()
		} else {
			activeTab.value = 0;
			getLocationInfo()
		}
	};
	const showPicker = () => {
		console.log("---")
		pickerHidden.value = false;
	}
	const onCityChange = (e) => {
		const index = e.detail.value; // 获取选中项的索引
		// 设置选中的城市名称
		if (index == 0) {
			morenCity.value = "上海"
			getApp().globalData.indexLocationCity = "上海"
			NotDataShowStatus.value = false;
			DataShowStatus.value = true;
			
		}
		getApp().globalData.indexLocation = 1;
		getLocationInfo()
	}
	//点击门店去预约
	const go_page_id = (shopId) => {
		uni.navigateTo({
			url: '/pages/index/select-project?massagistId=0&shopId=' + shopId
		})
	}
	//添加收藏
	const exicCollect = (shopId, busProductId) => {
		if (busProductId == 0) {
			if (checkLogin()) {
				shopApi.miniInsterOrDelete(shopId)
				getLocationInfo()
			}
		} else {
			uni.showModal({
				title: '提示',
				content: '确定要取消收藏吗？',
				confirmText: '确定',
				cancelText: "取消",
				success: async (res) => {
					if (res.confirm) {
						await shopApi.miniInsterOrDelete(shopId)
						uni.showToast({
							title: '已取消收藏',
							icon: 'success'
						});
						getLocationInfo()
					}
				}
			});
		}

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
	const openlocation = () => {
		uni.getSetting({
			success(res) {
				if (!res.authSetting['scope.userLocation']) {
					// 用户未授权，可以调用 uni.authorize
					uni.authorize({
						scope: 'scope.userLocation',
						success() {
							getLocationInfo()
						},
						fail() {
							uni.showModal({
								title: '请开启定位服务',
								content: '系统会根据您的位置推荐离你最近的店铺，请在设置中开启位置权限。',
								showCancel: false,
								success(res) {
									if (res.confirm) {
										// 引导用户去设置中开启权限
										uni.openSetting();
									}
								}
							});
						}
					});
				}
			}
		});

	}

	const getLocationInfo = () => {

		uni.getSetting({
			success(res) {
				if (!res.authSetting['scope.userLocation']) {
					if (activeTab.value == 0 && getApp().globalData.indexLocation == 0) {
						DataShowStatus.value = false
						NotDataShowStatus.value = true
					} else {
						console.log("---")
						exceOpertion()
					}
				} else {
					NotDataShowStatus.value = false
					DataShowStatus.value = true
					uni.getLocation({
						type: 'wgs84', // 坐标系类型
						altitude: true, // 是否获取高度
						success: async (res) => {
							getApp().globalData.indexLocationCity = ''
							getApp().globalData.indexLocation = 0
							uni.showLoading({
								title: '加载中...'
							});
							console.log('位置信息：', {
								latitude: res.latitude, // 纬度
								longitude: res.longitude, // 经度
								accuracy: res.accuracy, // 位置精度（米）
								altitude: res.altitude // 高度（米）
							});
							await cookie.updStoreList(res.latitude, res.longitude)
							hasLocation.value = true
							let listShop = cookie.getStoreList()
							//推荐门店
							if (activeTab.value == 0) {
								//let shopCollect = await shopApi.miniShopCollect()
								shoplist.value = listShop.filter(t => {
									return t.shopRecommend == 1
								});
							}
							//所有门店
							else {
								shoplist.value = listShop
							}

							if (shoplist.value.length > 0) {
								seachStatus.value = true
								notdatadisplay.value = false
							} else {
								notdatadisplay.value = true
								seachStatus.value = false
							}
							let data = await shopApi.miniCityAndStreet({
								latitude: res.latitude,
								longitude: res.longitude
							});
							/* morenCity.value = data.city
							morenStreet.value = data.street */
							uni.hideLoading();
						}
					});
				}
			}
		})
	}
	//点击搜索
	let inputValue = ""
	const seachData = () => {
		shoplist.value = cookie.getStoreList().filter(t => {
			return t.name.includes(inputValue)
		});
	}
	const onKeyInput = (val) => {
		inputValue = val.detail.value
	}
	const callMobile = (mobile) => {
		uni.makePhoneCall({
			phoneNumber: mobile, // 电话号码
			success: function() {
				console.log('拨打电话成功！');
			},
			fail: function(err) {
				console.error('拨打电话失败：', err);
			}
		});
	}
	onShow(() => {

		getLocationInfo()

	})

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
	const exceOpertion = async () => {
		NotDataShowStatus.value = false
		DataShowStatus.value = true
		seachStatus.value = true
		uni.showLoading({
			title: '加载中...'
		});
		await cookie.updStoreList(0, 0)
		hasLocation.value = false
		let listShop = cookie.getStoreList()
		//推荐门店
		if (activeTab.value == 0) {
			//let shopCollect = await shopApi.miniShopCollect()
			shoplist.value = listShop.filter(t => {
				return t.shopRecommend == 1
			});
		}
		//所有门店
		else {
			shoplist.value = listShop
		}
		morenCity.value = getApp().globalData.indexLocationCity
		if (getApp().globalData.indexLocationCity == '') {
			morenCity.value = "上海"
		}
		morenStreet.value = "未开启定位"
		uni.hideLoading();
	}
</script>

<style lang="less" scoped>
	.treatment-record {
		padding-bottom: 20upx;

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
				font-size: 28rpx;
				color: #666;
				position: relative;
				transition: color 0.3s;

				&.active {
					font-size: 28rpx;
					color: #584219;
					font-weight: bold;

					&::after {
						content: '';
						position: absolute;
						bottom: 0;
						left: 50%;
						transform: translateX(-50%);
						width: 40upx;
						height: 4upx;
						background-color: #584219;
						border-radius: 2upx;
					}
				}
			}
		}

		.shop-nearest-tag {
			font-size: 20upx;
			line-height: 28upx;
			color: #584219;
			background-color: #EDE6DA;
			border-radius: 8upx;
			padding: 0 8upx;
			margin-right: 8upx;
		}

		.shop-distance {
			font-size: 24upx;
			color: #8A6A40;
		}
	}
</style>