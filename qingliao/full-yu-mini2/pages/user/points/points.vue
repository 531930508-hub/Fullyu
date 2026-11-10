<template>
	<view class="min-h-screen" style="background-color:#F6F4F2 ;">
		<TopTitle></TopTitle>
		<view class="treatment-record" >
			<view class="tab-nav " :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">
				<view v-for="(tab, index) in tabs" :key="index" :class="['tab-item', { active: activeTab === index }]"
					@click="switchTab(index)">
					{{ tab.name }}
				</view>
			</view>
			<view class="px-5 py-3" :style="{marginTop:customBar+'px'}">
				<!-- 有效积分 -->
				<view v-if="tableData.length>0" class="bg-white rounded-lg px-4 text-[#584219] text-[26rpx] pt-2 pb-2">
					<view v-for="(item, index) in tableData" :key="index" class="flex items-center h-[90rpx]">
						<view class="w-1/4">
							{{item.score}}积分
						</view>
						<view class="w-3/4 text-right">
							{{item.createTime}} {{item.comment}}
						</view>
					</view>
				</view>

				<!-- 过期积分 -->
				<view v-if="false" class="bg-white rounded-lg px-4 text-[#584219] text-[26rpx] pt-2 pb-2">
					<view class="flex items-center h-[90rpx]">
						<view class="w-1/2">
							-1积分
						</view>
						<view class="w-1/2 text-right">
							2025-08-03 过期
						</view>
					</view>
					<view class="flex items-center h-[90rpx]">
						<view class="w-1/2">
							-1积分
						</view>
						<view class="w-1/2 text-right">
							2025-08-03 过期
						</view>
					</view>
					<view class="flex items-center h-[90rpx]">
						<view class="w-1/2">
							-1积分
						</view>
						<view class="w-1/2 text-right">
							2025-08-03 过期
						</view>
					</view>
					<view class="flex items-center h-[90rpx]">
						<view class="w-1/2">
							-1积分
						</view>
						<view class="w-1/2 text-right">
							2025-08-03 过期
						</view>
					</view>
				</view>

				<!-- 无数据 -->
				<view v-if="tableData.length==0">
						<view class="flex justify-center pt-[300rpx]">
							<image mode="widthFix" class="w-[200rpx] h-[160rpx]" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png"></image>
						</view>
						<view class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">这里空空如也</view>
					</view>
			</view>
		</view>
	</view>
</template>

<script setup>
	import {
		onLoad,
		onReachBottom,
		onShow
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
	import TopTitle from '../../../components/TopTitle.vue';
	import integrationApi from '../../../api/integration'

	const {
		proxy
	} = getCurrentInstance()
	const vm = proxy
	// 标签页数据
	const tabs = ref([{
			name: '积分记录',
			status: '1'
		},
		{
			name: '失效的积分',
			status: '2'
		}
	]);


	// 当前激活的标签页
	const activeTab = ref(0);
	const fristIsShow = ref(true)
	const twoIsShow = ref(true)
	// 切换标签页
	const switchTab = (index) => {
		activeTab.value = index
		searchData()
	};

	//请求参数
	const params = reactive({
		page: 1,
		size: 20,
		order: '-id',
	})
	const {
		page,
		size
	} = toRefs(params)
	//积分记录与总数
	const data = reactive({
		tableData: [],
		total: 0
	})
	const {
		tableData,
		total
	} = toRefs(data)

	const searchData = () => {
		params.page = 1
		fetchData()
	}

	const fetchData = async () => {
		if (activeTab.value == 0) {
			//获取积分记录
			const {
				list,
				total
			} = await integrationApi.getIntegrationRecord({
				...params,
				type: 1
			})
			if (params.page == 1) {
				data.tableData = list || []
			} else {
				data.tableData = [...data.tableData, ...list]
			}
			if (data.total) {
				return
			}
			data.total = total || 0
		}
		if (activeTab.value == 1) {
			//获取失效的积分记录
			const {
				list,
				total
			} = await integrationApi.getIntegrationRecord({
				...params,
				statemini: 3//3标识积分使用和过期积分
			})
			list.forEach(o => {
			    if (o.state == 2) {
			      o.comment = '积分过期'
			    }
			  })
			if (params.page == 1) {
				data.tableData = list || []
			} else {
				data.tableData = [...data.tableData, ...list]
			}
			if (data.total) {
				return
			}
			data.total = total || 0
		}
	}
	onShow(() => {
		searchData()
	})
	//触底加载下一页事件
	onReachBottom(() => {
		const allTotal = params.page * params.size
		if (allTotal >= data.total) {
			return
		}
		params.page++;
		//加载次数递加
		fetchData()
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
</script>

<style lang="less" scoped>
	.sticky-top {
		position: -webkit-sticky;
		/* for Safari */
		position: sticky;
		top: 100px;
		background-color: #f5f5f5;
		/* Match the page background */
		z-index: 99;
	}

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

	}
</style>