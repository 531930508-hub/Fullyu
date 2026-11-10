<template>
	<view style="background-color:#F6F4F2 ;">
		<TopTitle></TopTitle>
		<view :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">
			<view class="treatment-record">
				<view class="tab-nav sticky-top" :style="{marginTop:customBar+'px'}">
					<view v-for="(tab, index) in tabs" :key="index"
						:class="['tab-item', { active: activeTab === index }]" @click="switchTab(index)">
						{{ tab.name }}
					</view>
				</view>
			</view>
		</view>
		<!-- 疗愈师偏好：收藏 / 暂别 -->
		<view v-if="activeTab==0">
			<!-- 分段筛选：全部 / 想再约 / 暂别 -->
			<view class="flex items-center mx-5 mt-3 p-[4rpx] rounded-full" style="background-color:#F0EEEA;">
				<view v-for="opt in prefOptions" :key="opt.value" @click="switchPref(opt.value)"
					:class="['flex-1 text-center py-[10rpx] rounded-full text-[24rpx]', prefSegment === opt.value ? 'bg-white text-[#584219] font-medium' : 'text-[#8A6A40]']">
					{{ opt.name }}
				</view>
			</view>
			<!-- 暂别说明条 -->
			<view v-if="prefSegment === 'blocked'"
				class="mx-5 mt-3 px-3 py-[14rpx] rounded-lg text-[#7A736B] text-[24rpx] leading-relaxed"
				style="background-color:#F0EEEA;">
				暂别的疗愈师不会出现在你的预约和自动分配里，随时可以解除
			</view>

			<view class="px-5">
				<view v-for="(therapist, index) in prefList" :key="therapist.preferenceKey || index"
					class="px-4 pb-1 bg-white rounded-xl mt-2">
					<view class="flex items-center pb-3 pt-2" style="border-bottom:1rpx dashed #F0F0F0">
						<view class="flex justify-center" style="width: 10%;">
							<image :src="therapist.avatarUrl || '/static/icons/avatar-placeholder.svg'" rounded-full
								mode="widthFix" class="h-[60rpx] w-[60rpx]"></image>
						</view>
						<view class="ml-2 pt-1" style="width: 38%;">
							<view class="text-[#1E1E1D] text-[30rpx] flex items-center">
								<text class="truncate">{{ therapist.name }}</text>
								<text v-if="therapist.status === 0" class="ml-2 text-[#B3AFA9] text-[22rpx]">已离职</text>
							</view>
							<view class="text-[#8C8B8A] text-[26rpx]">
								{{ $filters.shoreNameFilter(therapist.shopId) }}
							</view>
						</view>
						<!-- 偏好双标：收藏 ♥ 与暂别 🌙 同规格并列 -->
						<view class="flex-1 flex justify-end items-center">
							<image @click.stop="toggleFavorite(therapist)"
								:src="therapist.isFavorited?'/static/icons/shoucangselect.png':'/static/icons/favorite-therapist.png'"
								class="w-[30rpx] h-[30rpx]"></image>
							<text @click.stop="toggleFavorite(therapist)"
								:class="['text-[26rpx]', therapist.isFavorited ? 'text-[#C4A974]' : 'text-[#8A6A40]']">&nbsp;{{ therapist.isFavorited ? '已收藏' : '收藏' }}</text>
							<image @click.stop="toggleAvoid(therapist)"
								:src="therapist.isBlocked?'/static/icons/avoid-therapist-check.svg':'/static/icons/avoid-therapist.svg'"
								class="w-[30rpx] h-[30rpx] ml-[14rpx]"></image>
							<text @click.stop="toggleAvoid(therapist)"
								:class="['text-[26rpx]', therapist.isBlocked ? 'text-[#7A736B]' : 'text-[#8A6A40]']">&nbsp;{{ therapist.isBlocked ? '已暂别' : '暂别' }}</text>
						</view>
					</view>
					<view v-if="!therapist.isBlocked" class="h-[120rpx] flex justify-end items-center pt-1"
						@click="go_page_id(therapist.shopId,therapist.id,therapist.name)">
						<button class="bg-white"
							style="border: 1px solid #584219; margin-left: 47%;margin: 0;">预约疗愈师</button>
					</view>
					<view v-else class="h-[120rpx] flex justify-end items-center pt-1">
						<text class="text-[#B3AFA9] text-[24rpx]">解除暂别后即可预约</text>
					</view>
				</view>
			</view>

			<!-- 疗愈师列表空状态 -->
			<view v-if="prefList.length == 0">
				<view class="flex justify-center pt-[220rpx]">
					<image v-if="prefSegment === 'blocked'" mode="widthFix" class="w-[200rpx] h-[160rpx]"
						src="/static/icons/leaf-empty.svg"></image>
					<image v-else mode="widthFix" class="w-[200rpx] h-[160rpx]"
						src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png"></image>
				</view>
				<view class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">
					{{ prefSegment === 'blocked' ? '还没有暂别的疗愈师' : (prefSegment === 'favorite' ? '还没有想再约的疗愈师' : '这里空空如也') }}
				</view>
			</view>
		</view>

		<!-- 收藏的门店 -->
		<view v-if="activeTab==1" class="px-5">
			<view v-for="(item,index) in shopCollectList" :key="index"
				class="text-[#8A6A40] rounded-lg bg-white w-full h-[320rpx] px-4 pt-4 mt-2 text-[26rpx]">
				<view
					class="flex items-center text-[#584219] font-medium text-[28rpx] border-b border-[#F0EEEA] pb-3 ">
					<view class="w-4/5"> {{item.name}}</view>
					<view @click.stop="exicCollect(item.id,item.busProductId)"
						class="w-1/5 flex items-center justify-end">
						<image class="w-[35rpx] h-[35rpx]"
							:src="item.busProductId==0?'/static/icons/favorite-therapist.png':'/static/icons/shoucangselect.png'">
						</image>
						<text>&nbsp;收藏</text>
					</view>
				</view>
				<view class="flex justify-center items-center pt-3 ">
					<view class="w-full truncate">{{item.address}}</view>
				</view>
				<view class="flex justify-center items-center">
					<view class="w-1/2">
						<view class="mt-3 flex items-center" @click.stop="callMobile(item.mobile)">
							电话：{{item.mobile}}
						</view>
						<view class="mt-3">
							周一到周日 {{item.clockInTime}}-{{item.clockOutTime}}
						</view>
					</view>
					<view class="w-1/2 flex justify-end items-end h-[110rpx]">
						<button class="bg-white" @click="go_page_id(item.id,0)"
							style="border: 1px solid #584219; margin-left: 47%;margin: 0;">预约</button>
					</view>
				</view>
			</view>
		</view>

		<!-- 门店空状态 -->
		<view v-if="activeTab==1 && shopCollectList.length == 0">
			<view class="flex justify-center pt-[300rpx]">
				<image mode="widthFix" class="w-[200rpx] h-[160rpx]"
					src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png"></image>
			</view>
			<view class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">这里空空如也</view>
		</view>
	</view>
</template>

<script setup>
	import {
		onLoad,
		onShow
	} from "@dcloudio/uni-app"
	import {
		ref,
		computed
	} from 'vue'
	import TopTitle from '../../../components/TopTitle.vue';
	import cookie from "../../../utils/cookieUtil"
	import shopApi from "../../../api/shop"
	import customerMassagistRelationApi from "../../../api/customerMassagistRelation"
	import customerMassagistBlockApi from "../../../api/customerMassagistBlock"

	// 标签页仍按对象类型分，不新增第三个 Tab
	const tabs = ref([{
			name: '收藏的疗愈师',
			status: '1'
		},
		{
			name: '收藏的门店',
			status: '2'
		}
	]);
	const activeTab = ref(0);
	// 疗愈师 Tab 内的分段筛选，默认停在「想再约」，与原有收藏列表行为一致
	const prefOptions = [{
			name: '全部',
			value: 'all'
		},
		{
			name: '想再约',
			value: 'favorite'
		},
		{
			name: '暂别',
			value: 'blocked'
		}
	];
	const prefSegment = ref('favorite');
	const favoriteList = ref([]);
	const blockedList = ref([]);
	const shopCollectList = ref([]);
	const customBar = ref(0);

	const prefList = computed(() => {
		if (prefSegment.value === 'favorite') {
			return favoriteList.value;
		}
		if (prefSegment.value === 'blocked') {
			return blockedList.value;
		}
		return [...favoriteList.value, ...blockedList.value].sort((a, b) => {
			return (new Date(b.createTime || 0).getTime() || 0) - (new Date(a.createTime || 0).getTime() || 0);
		});
	});

	const switchTab = (index) => {
		activeTab.value = index;
		if (index == 1) {
			getShopCollectList();
		}
		if (index == 0) {
			fetchData();
		}
	};

	const switchPref = (value) => {
		prefSegment.value = value;
	};

	onShow(() => {
		fetchData();
	});

	onLoad(() => {
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
				customBar.value = custom.bottom + custom.top - e.statusBarHeight;
				// #endif
			}
		})
		fetchData();
		getShopCollectList();
	});

	const callMobile = (mobile) => {
		uni.makePhoneCall({
			phoneNumber: mobile,
			success: function() {
				console.log('拨打电话成功！');
			},
			fail: function(err) {
				console.error('拨打电话失败：', err);
			}
		});
	}

	// 同时拉取「想再约」与「暂别」，两者同页同层
	const fetchData = async () => {
		const [relationPage, blockPage] = await Promise.all([
			customerMassagistRelationApi.getPage({page: 1, size: 300, order: '-id'}),
			customerMassagistBlockApi.getPage({page: 1, size: 300})
		]);
		favoriteList.value = ((relationPage && relationPage.list) || []).map(s => {
			return {
				...s.massagist,
				relationId: s.id,
				createTime: s.createTime,
				preferenceKey: 'favorite-' + s.id,
				isFavorited: true,
				isBlocked: false
			};
		});
		blockedList.value = ((blockPage && blockPage.list) || []).map(s => {
			return {
				...s.massagist,
				blockId: s.id,
				createTime: s.createTime,
				preferenceKey: 'block-' + s.id,
				isFavorited: false,
				isBlocked: true
			};
		});
	}

	// 收藏：点亮直接生效；取消收藏沿用原有确认弹窗
	const toggleFavorite = async (therapist) => {
		if (therapist.isFavorited) {
			uni.showModal({
				title: '提示',
				content: '确定要取消收藏吗？',
				confirmText: '确定',
				cancelText: '取消',
				success: async (res) => {
					if (res.confirm) {
						await customerMassagistRelationApi.remove(therapist.relationId);
						uni.showToast({
							title: '取消收藏成功',
							icon: 'success'
						});
						fetchData();
					}
				}
			});
			return;
		}
		const wasBlocked = !!therapist.isBlocked;
		await customerMassagistRelationApi.createRelation(therapist.id);
		uni.showToast({
			title: '收藏成功',
			icon: 'success'
		});
		fetchData();
		if (wasBlocked) {
			setTimeout(() => {
				uni.showToast({
					title: '已同时解除暂别',
					icon: 'none'
				});
			}, 1800);
		}
	}

	// 暂别：设为暂别需确认；解除暂别即时生效
	const toggleAvoid = async (therapist) => {
		if (therapist.isBlocked) {
			await customerMassagistBlockApi.remove(therapist.blockId);
			uni.showToast({
				title: '已恢复，可以正常预约 TA 了',
				icon: 'none'
			});
			fetchData();
			return;
		}
		const res = await new Promise((resolve) => {
			uni.showModal({
				title: '暂时不约 TA？',
				content: `之后预约时会自动避开「${therapist.name}」，TA 不会收到任何通知，随时可以恢复。`,
				confirmText: '暂时不约',
				cancelText: '再想想',
				confirmColor: '#7A736B',
				success: resolve
			});
		});
		if (!res.confirm) {
			return;
		}
		const wasFavorited = !!therapist.isFavorited;
		await customerMassagistBlockApi.createRelation(therapist.id);
		uni.showToast({
			title: '已设为暂别，之后自动避开 TA',
			icon: 'none'
		});
		fetchData();
		if (wasFavorited) {
			setTimeout(() => {
				uni.showToast({
					title: '已同时取消对 TA 的收藏',
					icon: 'none'
				});
			}, 1800);
		}
	}

	// 取消收藏门店
	const exicCollect = (shopId) => {
		uni.showModal({
			title: '提示',
			content: '确定要取消收藏吗？',
			confirmText: '确定',
			cancelText: "取消",
			success: async (res) => {
				if (res.confirm) {
					await shopApi.miniInsterOrDelete(shopId);
					uni.showToast({
						title: '已取消收藏',
						icon: 'success'
					});
					getShopCollectList();
				}
			}
		});
	}

	const getShopCollectList = async () => {
		let listShop = cookie.getStoreList();
		let shopCollect = await shopApi.miniShopCollect();
		shopCollectList.value = (listShop || []).filter(t => {
			return shopCollect.includes(t.id)
		});
	}

	// 点击门店 / 疗愈师去预约
	const go_page_id = (shopId, massagistId, massagistName) => {
		uni.navigateTo({
			url: '/pages/index/select-project?massagistName=' + massagistName + '&massagistId=' + massagistId + '&shopId=' + shopId
		})
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
	}
</style>
