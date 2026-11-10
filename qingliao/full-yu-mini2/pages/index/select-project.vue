<template>
	<view class="min-h-screen" style="min-height: 1600rpx;">
		<!-- 轮播图区域 -->
		<view  class="relative">
			<view v-if="bannerList.length==0" class="w-full h-[340rpx]" style="position: relative;z-index: 1000;">
				<image :src="selectProjectImages[selectedProject-1]" class="w-full h-full object-cover"
					mode="aspectFill" />
			</view>
			<view v-else class="w-full h-[340rpx]" style="position: relative;z-index: 1000;">
				<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/shop/20250618/f0150089-3138-4424-bc56-459f7101f23a%28._.%29mentou.png" class="w-full h-full object-cover"
					mode="aspectFill" />
			</view>
			<!-- <swiper @change="handleSwiperChange" class="w-full h-[340rpx]" :indicator-dots="false" :autoplay="true"
				:interval="5000" :duration="500" style="position: relative;z-index: 1000;">
				<swiper-item v-for="(item, index) in bannerList" :key="index">
					<view class="w-full h-full relative overflow-hidden">
						<image :src="item.url" class="w-full h-full object-cover" mode="aspectFill" />
					</view>
				</swiper-item>
			</swiper>
			<view class="custom-indicator">
				<view v-for="(item, index) in bannerList" :key="index" class="indicator-dot"
					:class="{ 'active': index === swiperIndex }">
				</view>
			</view> -->
		</view>
		<view  class="relative w-full h-[80rpx] bg-[#CEC2B3] rounded-t-xl " style="margin-top: -50rpx;z-index: 1000; ">
			<view v-if="bannerList.length==0" class="bg-[#CEC2B3] h-[100rpx] flex justify-center items-center rounded-t-xl">
				<view class="w-1/3 h-[100rpx] rounded-t-xl  " :class="{selectstyle:selectedProject==2}"
					@click="selectProject(2)">
					<view class="w-full h-[60rpx] text-center text-[28rpx] text-[#584219] flex flex-col justify-end">
						全感舒筋</view>
					<view class="w-full h-[40rpx] text-center text-[20rpx] text-[#584219] ">Full Senses Massage
					</view>
				</view>
				<view class="w-1/3 h-[100rpx]  rounded-t-xl"
					:class="{selectstyle:selectedProject==1,twoProjectStyleRight:selectedProject==2,twoProjectStyleLeft:selectedProject==3}"
					@click="selectProject(1)">
					<view class="w-full h-[60rpx] text-center text-[28rpx] text-[#584219] flex flex-col justify-end">
						头部水疗
					</view>
					<view class="w-full h-[40rpx] text-center text-[20rpx] text-[#584219] ">Full Head Spa
					</view>
				</view>
				<view class="w-1/3 h-[100rpx] rounded-t-xl " :class="{selectstyle:selectedProject==3}"
					@click="selectProject(3)">
					<view class="w-full h-[60rpx] text-center text-[28rpx] text-[#584219] flex flex-col justify-end">
						全感悦耳
					</view>
					<view class="w-full h-[40rpx] text-center text-[20rpx] text-[#584219] ">Full Ear Spa

					</view>
				</view>
			</view>
			<view class="px-5 mt-4 text-[#584219]">
				<view v-if="bannerList.length==0" class="text-[24rpx]">{{ArrDurationDescr[selectedProject]}}</view>
				<view v-if="bannerList.length!=0" style="height: 2px;">&nbsp;</view>
				<view v-if="optionsMassagist==null||optionsMassagist==0" class="h-[60rpx] flex items-center justify-center mt-2">
					<view class="w-2/3">
						<text class="text-[28rpx] font-semibold">预约人数 &nbsp; </text>
						<text class="text-[22rpx]">(Number of Guests)</text>
					</view>
					<view class="w-1/3 flex justify-end">
						<view class="w-1/3 flex flex justify-center">
							<image src="/static/icons/minus-circle-contained.png" mode="widthFix"
								class="w-[40rpx] h-[40rpx]" @click="minusCountEvent"></image>
						</view>
						<view class="w-1/3">
							<text class="border rounded-md  flex justify-center">{{selectPeopleCount}}</text>
						</view>
						<view class="w-1/3 flex flex justify-center">
							<image src="/static/icons/add-square-04.png" mode="widthFix" class="w-[40rpx] h-[40rpx]"
								@click="addCountEvent"></image>
						</view>
					</view>
				</view>
				<view v-if="bannerList.length==0" class="h-[60rpx] flex items-center ">
					<text class="text-[28rpx] font-semibold">放松时长 &nbsp; </text>
					<text class="text-[22rpx]">(Duration)</text>
				</view>
				<view v-if="bannerList.length==0" class="treatment-types">
					<view v-for="(item,index) in ArrDuration" :key="index" class="treatment-type "
						:class="{active:selectedDuration === item}" @click="selectDuration(item)">
						<text class="treatment-name">{{item}} mins</text>
					</view>
				</view>
				<view v-if="bannerList.length==0" class="text-[24rpx] mt-2">{{ArrDurationminDesr}}</view>
				<view class="h-[60rpx] flex items-center mt-2">
					<text class="text-[28rpx] font-semibold">到店日期 &nbsp; </text>
					<text class="text-[22rpx]">(Date)</text>
				</view>
				<view class="time-grid">
					<template>
						<view v-for="(item,index) in ArrShopDate" :key="index" class="time-option"
							:class="{ active: selectedDate ===item.value }" @click="selectedDateEvent(item)">
							<text>{{ item.label }}</text>
						</view>
					</template>
				</view>
				<view class="h-[60rpx] flex items-center mt-1">
					<text class="text-[28rpx] font-semibold">到店时间 &nbsp; </text>
					<text class="text-[22rpx]">(Time)</text>
				</view>
				<view class="time-grid" :class="{ loading: isLoading }">
					<view v-if="isLoading" class="loading-container">
						<view class="loading-spinner"></view>
					</view>
					<template v-else>
						<view v-for="item in ArrShopTime" :key="item.time" class="time-option"
							:class="{ active: selectedTime === item.time&&item.state != 0, disabled: item.state === 0 }"
							@click="selectedTimeEvent(item)">
							<text>{{ item.time }}</text>
						</view>
					</template>
				</view>

				<view class="flex justify-center items-center mt-1 text-[26rpx] pb-4">
					<text>{{statusShow}}</text>

				</view>
			</view>
		</view>
		<view class="shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-[env(safe-area-inset-bottom)] px-5"
			style="height: 240rpx;position: fixed; bottom: 0;left: 0;width: 100%;background-color: #FFFFFF;z-index: 1000;">
			<view class="flex  items-center mt-3 ">
				<view class="w-3/5">
					<text class="font-semibold">当前预约门店 &nbsp; </text>{{shop ? shop.name : ''}}
				</view>
				<view class="w-1/4 flex justify-end items-center ">
					<image v-if="shop && shop.distanceInMeters!=0" class="w-[28rpx] h-[28rpx]"
						src="/static/icons/map-marker-alt-solid.png"></image>
					<text v-if="shop && shop.distanceInMeters!=0">{{shop.distanceInMeters}}km</text>
				</view>
				<view class="w-1/6 flex justify-end items-center ">
					<picker mode="selector" :range="shoplist" range-key="name" @change="onShopChange">
						<text>&nbsp;&nbsp; 切换</text>
					</picker>
					<image class="w-[28rpx] h-[28rpx]" src="/static/icons/arrow-right.png"></image>
				</view>
			</view>
			<view class="flex items-center  h-[70rpx] text-[23rpx] text-[#584219] " style="margin-top: -10rpx;">
				<view class=" w-4/5">{{optionsMassagistName}}
					{{selectedProjectName}}，{{selectedDuration}}mins，{{selectedDuanDate}}
					{{selectedTime}}
				</view>
				<view class="w-1/5 flex justify-end font-semibold">人数：{{selectPeopleCount}}</view>
			</view>
			<view class="flex justify-center items-center" style="gap: 30rpx;">
				<button class="w-1/2 h-[80rpx] flex justify-center items-center " @click="go_back"
					style="border: 1px solid #584219;">取消</button>
				<button @click="openPayModelPage" :disabled="!canConfirm || isSubmitting"
					class="w-1/2 h-[80rpx] flex justify-center items-center bg-[#584219] text-white">确定</button>
			</view>
		</view>


		<PayModelPage v-model:visible="showPaymentModal" :countdown="countdown" ref="payModelPageRef"
			@confirm="handlePaymentConfirm" @cancel="handleModifyCancel" />

		<!-- 预约入口先选门店：独立底部弹层，层级高于页面固定底栏，避免内容透出与遮挡 -->
		<view v-if="storePickerVisible" class="store-sheet-layer">
			<view class="store-sheet-mask" @tap="noop" @touchmove.stop.prevent="noop"></view>
			<view class="store-sheet">
				<view class="store-sheet-handle"></view>
				<view class="store-sheet-head">
					<view class="store-sheet-head-main">
						<view class="store-sheet-title">选择预约门店</view>
						<view class="store-sheet-sub">
							{{ storePickerChoice != null && storePickerChoice === nearestId
								? '已按定位为你选好最近门店'
								: (nearestId ? '已带入预约入口门店，可切换'
									: '未获取到定位，请选择到店门店') }}
						</view>
					</view>
					<view class="store-sheet-close" @click="cancelStorePicker">×</view>
				</view>
				<scroll-view scroll-y class="store-sheet-list" :style="{ height: storeListHeight }">
					<view v-for="item in shoplist" :key="item.id" class="store-sheet-item"
						:class="{ active: storePickerChoice === item.id }" @click="chooseStore(item.id)">
						<view class="store-sheet-item-main">
							<view class="store-sheet-name">
								{{ item.name }}
								<text v-if="item.id === nearestId" class="store-sheet-tag">最近</text>
							</view>
							<view class="store-sheet-addr">{{ item.shortAddress || item.address }}</view>
						</view>
						<view class="store-sheet-meta">
							<text v-if="distanceText(item)" class="store-sheet-distance">{{ distanceText(item) }}</text>
							<view class="store-sheet-check" :class="{ checked: storePickerChoice === item.id }">
								<view v-if="storePickerChoice === item.id" class="store-sheet-dot"></view>
							</view>
						</view>
					</view>
				</scroll-view>
				<view v-if="!nearestId" class="store-sheet-locate" @click="useMyLocation">使用我的位置推荐</view>
				<view class="store-sheet-actions">
					<button class="store-sheet-cancel" @click="cancelStorePicker">取消</button>
					<button class="store-sheet-confirm" :disabled="!storePickerChoice" @click="confirmStorePicker">
						确定
					</button>
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
		ref,
		reactive,
		computed,
		getCurrentInstance,
		onMounted
	} from 'vue'
	import miniImageApi from "../../api/miniImage"
	import cookie from "../../utils/cookieUtil"
	import customerApi from '../../api/customer'
	import PayModelPage from '@/components/PayModelPage.vue';
	import moment from 'moment';
	import api from '../../api/order.js'
	import shopApi from "../../api/shop";
	import { canConfirmBooking, bookingFailureMessage } from '../../utils/bookingSelection';
	import orderApi from "../../api/order";
	import productApi from "../../api/product";
	import constant from '../../consts/constant'
	import customerMassagistBlockApi from "../../api/customerMassagistBlock"
	import { pickDefaultStore, nearestStore, distanceText } from '../../utils/storeSelection';

	const {
		proxy
	} = getCurrentInstance()
	const vm = proxy
	const shoplist = ref([]) //所有门店列表
	let selectPeopleCount = ref(1); //默认人数
	let selectedProject = ref(2); //默认项目
	let selectedProjectName = ref("全感舒筋"); //默认项目
	let selectedDuration = ref(30); //默认时长
	let ArrDuration = ref([30, 60, 90]); //时长数组//沉浸场域结合音乐与正念引导，调节脑电波，专注当下放松身心，激活副交感神经，促进恢复。
	let ArrDurationDescr = ref(['1',
		'沉浸式头部护理体验，结合头皮清洁与按摩，在沉浸场域与正念调节中释放头部压力',
		'在沉浸场域与正念调节中，针对身体不同部位进行放松护理，每30分钟专注一个部位：肩颈 / 头部 / 眼部 / 面部 / 手臂 / 小腿', '专业耳部清洁与放松护理，在沉浸场域与正念调节中，释放耳部压力'
	])
	let selectProjectImages = ref(['https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/headselect.jpg',
		'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/bodyselect.jpg',
		'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/earselect.jpg'
	])
	let ArrDurationDescrSelect = ref("")
	let limitationCount = ref(3); //默认限制人数
	const selectedDuanDate = ref('');
	const selectedDate = ref(null); // 默认选中当天
	let ArrShopDate = ref([]) //默认日期
	const selectedTime = ref(null); //选择到店时间
	let ArrShopTime = ref([]) //默认时间
	// 支付弹框显示状态
	const showPaymentModal = ref(false);
	//门店技师
	const therapist = ref([])
	const isLoading = ref(false);
	const isSubmitting = ref(false);
	const canConfirm = computed(() => canConfirmBooking(isLoading.value, selectedTime.value, ArrShopTime.value));
	let timeRequestId = 0;
	let timeRequestTimer = null;
	let dateRequestId = 0;
	const invalidateTimes = () => {
		timeRequestId++;
		clearTimeout(timeRequestTimer);
		selectedTime.value = null;
		ArrShopTime.value = [];
		statusShow.value = '';
	};

	const payModelPageRef = ref(null)

	const handlePaymentConfirm = (paymentData) => {
		console.log('支付信息:', paymentData);
		showPaymentModal.value = false;
		cookie.updCouponCount()
		cookie.updIntegration()
		if (paymentData == 'notpay') {
			uni.showToast({
				title: '未支付！',
				icon: "error"
			}, 1000);
			setTimeout(() => {
				uni.switchTab({
					url: '/pages/user/order/order'
				});
			}, 1000)
		} else {
			console.log("----------------------+++++++++++++++++++++")
			uni.showToast({
				title: '支付成功！',
			}, 2000);
			setTimeout(() => {
				uni.navigateTo({
					url: '/pages/index/pay-success/appointment-success?topdisplayStatus=true&orderId=' +
						paymentData
				});
			}, 2000)
		}
	}
	const handleModifyCancel = () => {
		uni.showToast({
			title: '未支付！',
			icon: "error"
		}, 1000);
		setTimeout(() => {
			uni.switchTab({
				url: '/pages/user/order/order'
			})
		}, 1000)
	}

	//减少人数
	function minusCountEvent() {
		if (selectPeopleCount.value == 1) {
			uni.showToast({
				title: `至少预约${selectPeopleCount.value}人`,
				icon: 'none'
			});
		} else {
			selectPeopleCount.value = selectPeopleCount.value - 1;
			getTimeList()
		}
	}
	//增加人数
	function addCountEvent() {
		if (selectPeopleCount.value >= limitationCount.value) {
			uni.showToast({
				title: `最多预约${selectPeopleCount.value}人`,
				icon: 'none'
			});
		} else {
			if(optionsMassagist.value!=null&&optionsMassagist.value>0){
				uni.showToast({
					title: `您指定了疗愈师，最多预约1人`,
					icon: 'none'
				});
			}else{
				selectPeopleCount.value = selectPeopleCount.value + 1;
				getTimeList()
			}
		}
	}
	//选择项目
	function selectProject(project) {
		selectedProject.value = project;
		if (project == 2) {
			selectedDuration.value = 30;
			ArrDuration = [30, 60, 90];
			selectedProjectName.value = "全感舒筋"
		}
		if (project == 1) {
			selectedDuration.value = 60;
			ArrDuration = [60, 90];
			selectedProjectName.value = "头部水疗"
		}
		if (project == 3) {
			selectedDuration.value = 30;
			ArrDuration = [30, 60];
			selectedProjectName.value = "全感悦耳"
		}
		getTimeList()
		maxPeopleCount()
		selectMinText()
	}
	// 选择放松时长
	function selectDuration(duration) {
		selectedDuration.value = duration;
		getTimeList()
		selectMinText()
	}
	const ArrDurationminDesr = ref(null)

	function selectMinText() {
		if (selectedProject.value == 2 && selectedDuration.value == 30) {
			ArrDurationminDesr.value = '零重力单点深释｜头 / 眼 / 面 / 肩颈 / 手臂 / 小腿任选1个'
		}
		if (selectedProject.value == 2 && selectedDuration.value == 60) {
			ArrDurationminDesr.value = '零重力双区联动｜任选2个部位组合疗愈'
		}
		if (selectedProject.value == 2 && selectedDuration.value == 90) {
			ArrDurationminDesr.value = '零重力三轴重塑｜任选3个部位深度修复'
		}
		if (selectedProject.value == 1 && selectedDuration.value == 30) {
			ArrDurationminDesr.value = '洗护 + 吹干｜碎片时间快速清爽'
		}
		if (selectedProject.value == 1 && selectedDuration.value == 60) {
			ArrDurationminDesr.value = '洗护 + 吹干｜碎片时间快速清爽 + 神经放松 + 普洱茶汤水循环｜标准疗愈体验'
		}
		if (selectedProject.value == 1 && selectedDuration.value == 90) {
			ArrDurationminDesr.value = '洗护 + 吹干｜碎片时间快速清爽 + 神经放松 + 普洱茶汤水循环｜标准疗愈体验 + 眉心滴油深愈｜深度修复'
		}
		if (selectedProject.value == 3 && selectedDuration.value == 30) {
			ArrDurationminDesr.value = '基础清洁 + 神经速调｜快放松优先，清洁为维护级'
		}
		if (selectedProject.value == 3 && selectedDuration.value == 60) {
			ArrDurationminDesr.value = '精采深洁 + 颅息放松｜清洁疗愈双达标'
		}

	}
	//选择到店日期事件
	function selectedDateEvent(date) {
		selectedDate.value = date.value;
		selectedDuanDate.value = date.label
		getTimeList()
	}
	// 选择时间
	function selectedTimeEvent(time) {
		if (time.state === 1) {
			selectedTime.value = time.time;
		}
	}
	// 门店信息
	const shop = ref(null)
	onShow(() => {
		
		getAllData()
	})
	const optionsMassagist = ref(0)
	const optionsMassagistName = ref(0)
	const optionsShopId = ref(0)
	const optionsProjectId = ref(0)
	const storePickerVisible = ref(false)
	// scroll-view 必须有确定高度才能滚动：按门店数给高度，最多露 5 行
	const storeListHeight = computed(() => {
		const count = Math.min(Math.max((shoplist.value || []).length, 1), 5)
		return (count * 150) + 'rpx'
	})
	const storePickerChoice = ref(null)
	const nearestId = ref(null)
	const userLocation = ref(null)
	let storePickerOpened = false
	const bannerList = ref([])
	onLoad((options) => {

		fetchBannerList()
		//根据位置获取最近的店铺列表
		optionsMassagist.value = options.massagistId
		optionsMassagistName.value = options.massagistName
		const specifiedMassagistName = options.massagistName
		optionsShopId.value = options.shopId
		optionsProjectId.value = options.projectId
		if (optionsMassagistName.value != null && optionsMassagistName.value != 'undefined' && optionsMassagistName
			.value != "") {
			optionsMassagistName.value = "疗愈师：" + optionsMassagistName.value + ','
		} else {
			optionsMassagistName.value = ''
		}
		if (optionsProjectId.value != null && optionsProjectId.value != 'undefined' && optionsProjectId
			.value != "") {
			let selectId = 0
			if (options.projectId == "1") {
				selectId = 1
			}
			if (options.projectId == "2") {
				selectId = 2
			}
			if (options.projectId == "4") {
				selectId = 3
			}
			selectedProject.value = selectId; //默认项目
			if (selectedProject.value == 1) {
				selectedProjectName.value = "头部水疗"; //默认项目
			}
			if (selectedProject.value == 2) {
				selectedProjectName.value = "全感舒筋"; //默认项目
			}
			if (selectedProject.value == 3) {
				selectedProjectName.value = "全感悦耳"; //默认项目
			}
			let minute = 0
			if (options.projectMinute == "30" || options.projectMinute == "15") {
				minute = 30
			}
			if (options.projectMinute == "60" || options.projectMinute == "45") {
				minute = 60
			}
			if (options.projectMinute == "90") {
				minute = 90
			}
			selectedDuration.value = minute; //默认时长
		}
		
		ArrDurationDescrSelect.value = ArrDurationDescr.value[selectedProject.value]
		selectMinText()
		locationWZ()
		checkSpecifiedMassagistAvoided(specifiedMassagistName)
	});

	// 指定技师进入时若已设为暂别：提示并清除指定，走自动分配
	const avoidedMassagistIds = ref([])
	const checkSpecifiedMassagistAvoided = async (massagistName) => {
		if (!optionsMassagist.value || optionsMassagist.value <= 0 || !cookie.getToken()) {
			return
		}
		try {
			avoidedMassagistIds.value = await customerMassagistBlockApi.getIds() || []
		} catch (err) {
			console.error(err)
			return
		}
		if (!avoidedMassagistIds.value.some(id => String(id) === String(optionsMassagist.value))) {
			return
		}
		const name = massagistName && massagistName != 'undefined' ? massagistName : '这位疗愈师'
		optionsMassagist.value = 0
		optionsMassagistName.value = ''
		uni.showModal({
			title: '已为你避开 TA',
			content: `你之前把「${name}」设为了暂别，本次预约将自动安排其他疗愈师。`,
			showCancel: false,
			confirmText: '好的'
		})
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
	const orderInfo = ref([])
	const countdown = ref(0)
	const statusShow = ref(null)
	const openPayModelPage = async () => {
		if (isSubmitting.value || !checkLogin()) return;
		if (!canConfirm.value || !shop.value) {
			uni.showToast({ title: '请选择当前可预约的到店时间', icon: 'none' });
			return;
		}
		const project = selectedProject.value === 3 ? 4 : selectedProject.value;
		const request = {
			personCount: selectPeopleCount.value,
			durationMinutes: selectedDuration.value,
			startTime: selectedDate.value + ' ' + selectedTime.value + ':00',
			shopId: shop.value.id,
			isUpdateSort: !(optionsMassagist.value > 0),
			massagistIdList: optionsMassagist.value > 0 ? [optionsMassagist.value] : []
		};
		isSubmitting.value = true;
		uni.showLoading({ title: '处理中', mask: true });
		try {
			const products = await productApi.productlist();
			const product = (products || []).find(t => t.content && t.content[0]
				&& Number(t.content[0].projectId) === Number(project));
			if (!product) throw '未找到对应的项目，请重新选择';
			const orderId = await orderApi.createOrder({ ...request, productId: product.id, appointmentType: 2 });
			if (!orderId) throw '预约订单未创建，请稍后重试';
			orderInfo.value = await orderApi.infoWithDetail(orderId);
			if (!orderInfo.value) throw '订单不存在，请在订单页核对';
			if ([1, 2].includes(Number(orderInfo.value.state))) {
				uni.showToast({ title: '订单已支付', icon: 'none' });
			} else if ([3, 4, 5, 6].includes(Number(orderInfo.value.state))) {
				uni.showToast({ title: '订单已结束，请重新预约', icon: 'none' });
			} else {
				const created = Date.parse(orderInfo.value.createTime) / 1000;
				countdown.value = Math.max(0, constant.payCutDownSeconds - (Date.now() / 1000 - created));
				if (countdown.value > 0) {
					showPaymentModal.value = true;
					if (payModelPageRef.value) await payModelPageRef.value.fetchData(orderId);
				} else {
					uni.showToast({ title: '订单已超时，请重新预约', icon: 'none' });
				}
			}
		} catch (error) {
			selectedTime.value = null;
			uni.showModal({ title: '预约未能确认', content: bookingFailureMessage(error), showCancel: false });
		} finally {
			uni.hideLoading();
			isSubmitting.value = false;
		}
	}
	const getAllData =() => {
		//到店日期
		//locationWZ()
		/* setTimeout(async () => {
			
			
		}, 500) */
		//到店时间

	}
	async function maxPeopleCount() {
		limitationCount.value = await shopApi.maxPeopleCount(shop.value.id, selectedProject.value, selectedDate.value)
		console.log("limitationCount.value=" + limitationCount.value)
	}
	const findBookingDates = async () => {
		const requestId = ++dateRequestId;
		invalidateTimes();
		ArrShopDate.value = [];
		selectedDate.value = null;
		isLoading.value = true;
		if (!shop.value) { isLoading.value = false; return; }
		const shopId = shop.value.id;
		try {
			const dates = await api.findBookingDates(shopId);
			if (requestId !== dateRequestId || shop.value.id !== shopId) return;
			ArrShopDate.value = dates || [];
			if (ArrShopDate.value.length) {
				selectedDate.value = ArrShopDate.value[0].value;
				selectedDuanDate.value = ArrShopDate.value[0].label;
				maxPeopleCount();
				getTimeList();
			} else {
				statusShow.value = '当前门店暂无可预约日期';
				isLoading.value = false;
			}
		} catch (error) {
			if (requestId !== dateRequestId) return;
			statusShow.value = bookingFailureMessage(error);
			isLoading.value = false;
		}
	}

	async function getTimeList() {
		invalidateTimes();
		if (!selectedDate.value || !selectedDuration.value || !selectedProject.value || !shop.value) {
			isLoading.value = false;
			return;
		}
		isLoading.value = true;
		if (optionsMassagist.value > 0 && avoidedMassagistIds.value.some(id => String(id) === String(optionsMassagist.value))) {
			optionsMassagist.value = 0;
			optionsMassagistName.value = '';
			uni.showToast({ title: '已为你避开暂别的疗愈师，改为自动安排', icon: 'none' });
		}
		const requestId = timeRequestId;
		const params = {
			date: selectedDate.value, personCount: selectPeopleCount.value,
			projectId: selectedProject.value === 3 ? 4 : selectedProject.value,
			durationMinutes: selectedDuration.value,
			massagistId: optionsMassagist.value > 0 ? optionsMassagist.value : null,
			shopId: shop.value.id
		};
		timeRequestTimer = setTimeout(async () => {
			try {
				const res = await api.timeList(params);
				if (requestId !== timeRequestId) return;
				ArrShopTime.value = Array.isArray(res) ? res : [];
				statusShow.value = ArrShopTime.value.some(t => Number(t.state) === 1)
					? '' : '当前条件暂无可预约时段，请调整日期或门店';
			} catch (error) {
				if (requestId !== timeRequestId) return;
				statusShow.value = bookingFailureMessage(error);
				uni.showModal({ title: '暂时无法预约', content: statusShow.value, showCancel: false });
			} finally {
				if (requestId === timeRequestId) isLoading.value = false;
			}
		}, 800);
	}
	const onShopChange = async (e) => {
		if (isSubmitting.value) return;
		const next = shoplist.value[e.detail.value];
		if (next && (!shop.value || next.id !== shop.value.id)) {
			shop.value = next;
			await findBookingDates();
		}
	}

	// 预约入口统一先选门店：入口带了门店就预选它，没带就按定位预选最近门店。
	const applyDefaultStore = () => {
		const id = pickDefaultStore(shoplist.value, {
			shopId: optionsShopId.value,
			latitude: userLocation.value && userLocation.value.latitude,
			longitude: userLocation.value && userLocation.value.longitude
		})
		shop.value = (shoplist.value || []).find(s => Number(s.id) === Number(id)) || null
		storePickerChoice.value = id
		const nearest = nearestStore(shoplist.value,
			userLocation.value && userLocation.value.latitude,
			userLocation.value && userLocation.value.longitude)
		nearestId.value = nearest ? nearest.id : null
	}
	const openStorePicker = () => {
		if (storePickerOpened || !(shoplist.value || []).length) return
		storePickerOpened = true
		storePickerVisible.value = true
	}
	const noop = () => {}
	const chooseStore = (id) => {
		storePickerChoice.value = id
	}
	const confirmStorePicker = async () => {
		const picked = (shoplist.value || []).find(s => Number(s.id) === Number(storePickerChoice.value))
		if (!picked) return
		const changed = !shop.value || Number(shop.value.id) !== Number(picked.id)
		shop.value = picked
		storePickerVisible.value = false
		if (changed) await findBookingDates()
	}
	const cancelStorePicker = () => {
		storePickerVisible.value = false
		go_back()
	}
	const useMyLocation = () => {
		uni.getLocation({
			type: 'wgs84',
			success: async (res) => {
				userLocation.value = { latitude: res.latitude, longitude: res.longitude }
				await cookie.updStoreList(res.latitude, res.longitude)
				shoplist.value = cookie.getStoreList() || []
				applyDefaultStore()
				await findBookingDates()
			},
			fail: () => uni.showToast({ title: '未能获取定位，请手动选择门店', icon: 'none' })
		})
	}
	const locationWZ = async () => {
		const loadStores = async () => {
			shoplist.value = cookie.getStoreList() || []
			applyDefaultStore()
			openStorePicker()
			findBookingDates()
		}
		uni.getSetting({
			success: async (res) => {
				if (res.authSetting['scope.userLocation']) {
					await new Promise(resolve => {
						uni.getLocation({
							type: 'wgs84', // 坐标系类型
							altitude: true, // 是否获取高度
							success: async (loc) => {
								userLocation.value = { latitude: loc.latitude, longitude: loc.longitude }
								await cookie.updStoreList(loc.latitude, loc.longitude)
								resolve()
							},
							fail: () => resolve()
						});
					})
				} else {
					await cookie.updStoreList(0, 0)
				}
				await loadStores()
			},
			fail: async () => {
				await cookie.updStoreList(0, 0)
				await loadStores()
			}
		});
	}
	const fetchBannerList = async () => {
		bannerList.value = await miniImageApi.appointmentImageList()
		console.log("bannerList.value")
		console.log(bannerList.value.length)
	}
	const go_back = () => {
		uni.navigateBack({
			delta: 1
		})
	}
	const go_page = (path) => {
		uni.navigateTo({
			url: path
		})
	}
	const go_page_notbutton = (path) => {
		console.log(path)
		uni.navigateTo({
			url: path
		});
	}
	
	/* // 轮播图数据
	const bannerList = ref([])
	const swiperIndex = ref(0)
	const handleSwiperChange = (e) => {
		swiperIndex.value = e.detail.current
	} */
</script>

<style lang="less" scoped>
	.selectstyle {
		background-color: white;
	}

	.twoProjectStyleRight {
		border-right: 1px solid gray;
	}

	.twoProjectStyleLeft {
		border-left: 1px solid gray;
	}

	// 放松时长样式
	.duration-options {
		display: flex;
		gap: 16rpx;
		margin-top: 16upx;
		margin-bottom: 16upx;

		.duration-option {
			width: 33%;
			border-radius: 8upx;
			padding: 8upx 20upx;
			border: 2upx solid #0000001A;
			transition: all 0.3s;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			position: relative;

			&.active {
				background-color: #5842191A;
				border-color: #584219;

				&::after {
					content: '';
					width: 22upx;
					height: 22upx;
					background: url('~@/static/icons/check-solid.svg') no-repeat center, #584219;
					background-size: 14upx 14upx, cover;
					border-top-right-radius: 4upx;
					border-bottom-left-radius: 8upx;
					position: absolute;
					top: 0;
					right: 0;
					color: #fff;
				}

				text {
					color: #584219;
				}
			}

			text {
				font-size: 28upx;
				color: #333333;
			}
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
		background-color: #FFFFFF;
		transition: all 0.3s ease;
	}

	.indicator-dot.active {
		width: 32rpx;
		height: 8rpx;
		border-radius: 4rpx;
		background-color: #584219;
	}




	// 时间网格样式
	.time-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16upx;
		margin-top: 15upx;
		margin-bottom: 16rpx;
		max-height: 320rpx;
		overflow-y: auto;
		padding-right: 10rpx; // 留出右侧滚动条宽度

		&.loading {
			grid-template-columns: none;
		}

		.loading-container {
			grid-column: 1 / -1;
			display: grid;
			place-items: center;
			height: 320rpx;
		}

		.time-option {
			border-radius: 8upx;
			padding: 8upx 12upx;
			border: 2upx solid #0000001A;
			text-align: center;
			transition: all 0.3s;
			display: flex;
			align-items: center;
			justify-content: center;

			&.widthNew {
				width: 180rpx;
			}

			&.active {
				background-color: #5842191A;
				border-color: #584219;
				position: relative;

				&::after {
					content: '';
					width: 22upx;
					height: 22upx;
					background: url('~@/static/icons/check-solid.svg') no-repeat center, #584219;
					background-size: 14upx 14upx, cover;
					border-top-right-radius: 4upx;
					border-bottom-left-radius: 8upx;
					position: absolute;
					top: 0;
					right: 0;
					color: #fff;
				}

				text {
					color: #584219;
				}
			}

			&.disabled {
				// background-color: #F0F0F0;
				border-color: #0000000f;

				text {
					color: #00000040;
				}
			}

			text {
				font-size: 24upx;
				color: #333333;
				font-weight: 400;
			}
		}
	}

	.loading-spinner {
		border: 4px solid rgba(0, 0, 0, 0.1);
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border-left-color: #584219;
		animation: spin 1s ease infinite;
	}

	// 项目类型样式
	.treatment-types {
		margin-top: 16upx;
		display: flex;
		gap: 24upx;


		.treatment-type {
			color: #584219;
			flex: 1;
			border-radius: 8upx;
			padding: 10upx 0;
			border: 2upx solid #0000001A;
			transition: all 0.3s;

			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;

			position: relative;

			&.active {
				background-color: #5842191A;
				border-color: #584219;

				&::after {
					content: '';
					width: 22upx;
					height: 22upx;
					background: url('~@/static/icons/check-solid.svg') no-repeat center, #584219;
					background-size: 14upx 14upx, cover;
					border-top-right-radius: 4upx;
					border-bottom-left-radius: 8upx;
					position: absolute;
					top: 0;
					right: 0;
					color: #fff;
				}

				.treatment-name,
				.treatment-name-en {
					color: #584219;
				}
			}

			.treatment-name {
				font-size: 26upx;
				font-weight: 500;
				color: #584219;
			}

		}
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}

		100% {
			transform: rotate(360deg);
		}
	}

	// 预约入口门店选择：独立底部弹层（层级高于页面固定底栏）
	.store-sheet-layer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 99999;
	}

	.store-sheet-mask {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		background: rgba(28, 22, 14, 0.48);
	}

	.store-sheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		max-height: 82vh;
		box-sizing: border-box;
		padding: 20rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
		background: #FFFFFF;
		border-radius: 32rpx 32rpx 0 0;
		box-shadow: 0 -12rpx 40rpx rgba(0, 0, 0, 0.14);
		letter-spacing: 0.05em;
	}

	.store-sheet-handle {
		width: 68rpx;
		height: 6rpx;
		margin: 0 auto 18rpx;
		border-radius: 999rpx;
		background: #E6DFD2;
	}

	.store-sheet-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20rpx;
		flex-shrink: 0;
	}

	.store-sheet-head-main {
		flex: 1;
		min-width: 0;
	}

	.store-sheet-title {
		font-size: 34rpx;
		font-weight: 600;
		line-height: 1.3;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.store-sheet-sub {
		margin-top: 8rpx;
		font-size: 24rpx;
		color: #8A7B66;
	}

	.store-sheet-close {
		flex-shrink: 0;
		width: 56rpx;
		height: 56rpx;
		border-radius: 50%;
		background: #F4F0E8;
		color: #584219;
		font-size: 36rpx;
		line-height: 52rpx;
		text-align: center;
	}

	.store-sheet-list {
		margin-top: 24rpx;
	}

	.store-sheet-item {
		display: flex;
		align-items: center;
		gap: 20rpx;
		padding: 24rpx;
		margin-bottom: 16rpx;
		border: 2rpx solid #ECE5D8;
		border-radius: 20rpx;
		background: #FFFFFF;
		transition: border-color 0.2s, background-color 0.2s;

		&.active {
			border-color: #584219;
			background: #F8F4EA;
		}

		&:last-child {
			margin-bottom: 0;
		}
	}

	.store-sheet-item-main {
		flex: 1;
		min-width: 0;
	}

	.store-sheet-name {
		display: flex;
		align-items: center;
		font-size: 30rpx;
		font-weight: 500;
		color: #2E2820;
	}

	.store-sheet-tag {
		margin-left: 12rpx;
		padding: 4rpx 10rpx;
		border-radius: 6rpx;
		background: #584219;
		color: #FFFFFF;
		font-size: 20rpx;
		line-height: 1;
		letter-spacing: 0.12em;
	}

	.store-sheet-addr {
		margin-top: 8rpx;
		font-size: 23rpx;
		color: #8A7B66;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.store-sheet-meta {
		display: flex;
		align-items: center;
		gap: 16rpx;
		flex-shrink: 0;
	}

	.store-sheet-distance {
		font-size: 24rpx;
		color: #584219;
		white-space: nowrap;
	}

	.store-sheet-check {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36rpx;
		height: 36rpx;
		box-sizing: border-box;
		border: 2rpx solid #D8D0C1;
		border-radius: 50%;

		&.checked {
			border-color: #584219;
		}
	}

	.store-sheet-dot {
		width: 18rpx;
		height: 18rpx;
		border-radius: 50%;
		background: #584219;
	}

	.store-sheet-locate {
		padding: 18rpx 0 4rpx;
		text-align: center;
		font-size: 24rpx;
		color: #584219;
		text-decoration: underline;
	}

	.store-sheet-actions {
		display: flex;
		gap: 24rpx;
		margin-top: 24rpx;
		flex-shrink: 0;

		button {
			flex: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			height: 88rpx;
			margin: 0;
			padding: 0;
			font-size: 28rpx;
			border-radius: 12rpx;
			letter-spacing: 0.05em;
		}
	}

	.store-sheet-cancel {
		background: #FFFFFF;
		color: #584219;
		border: 2rpx solid #584219;
	}

	.store-sheet-confirm {
		background: #584219;
		color: #FFFFFF;

		&[disabled] {
			opacity: 0.4;
		}
	}
</style>