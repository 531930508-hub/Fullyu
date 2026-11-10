<template>
	<view class="min-h-screen bg-[#F6F4F2] text-[#8A6A40] ">
		<TopTitleNotBack></TopTitleNotBack>
		<view class="tab-nav" :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">
			<view v-for="(tab, index) in tabs" :key="index" :class="['tab-item', { active: activeTab === index }]"
				@click="switchTab(index)">
				{{ tab.name }}
			</view>
		</view>
		<view :style="{marginTop:customBar+'px'}">
			<!-- 全部订单 -->
			<view v-if="activeTab!=3" class="record-list  text-[#8A6A40]">
				<view v-for="(record, index) in tableData" :key="index" class="record-card">
					<view :class="['status', {'red': record.state == 0,
		                                'green': record.state == 1 && record.appointmentState == 1,
		                                'default': record.state == 7 ||record.state == 5 ||record.state == 6 ||record.state == 2 || ( record.state == 1 && record.appointmentState == 2),
		                                'cancelled': record.appointmentState == 3
		                              }]">
						<text v-if="record.state == 0">未付款</text>
						<text v-else-if="record.state == 1 && record.appointmentState == 1">进行中</text>
						<text v-else-if="record.state == 1 && record.appointmentState == 2">已完成</text>
						<text v-else-if="record.state == 2">已完成</text>
						<text v-else-if="record.appointmentState == 3">已取消</text>
						<text v-else-if="record.state == 6">已退款</text>
						<text v-else-if="record.state == 5">退款中</text>
						<text v-else-if="record.state == 7">退款中</text>
					</view>
					<view v-if="record.state == 1 && record.appointmentState == 1"
						style="width: 80rpx;position: absolute;top: 15rpx;right: 55rpx;">
						<image open-type="share" src="/static/icons/external-link.png" class="w-[35rpx] h-[35rpx]" style="float: right;">
						</image>
						<button :data-id="record.id" :data-shopId="record.shopId" class="transparent-share-btn" open-type="share"></button>
					</view>
					
					<view class="record-row pt-3" style="border-top: 1rpx solid #EEECE8;">
						<text class="label">项目名称</text>
						<text class="value">{{ $filters.projectTitleFilter(record.orderDetailList?.[0].projectId) }}</text>
					</view>
					<!-- 开始时间 -->
					<view class="record-row " >
						<text class="label">开始时间</text>
						<text class="value">{{ record.startTime }}</text>
					</view>

					<!-- 放松时长 -->
					<view class="record-row">
						<text class="label">疗愈时长</text>
						<text class="value">{{ record.duration }} mins</text>
					</view>

					<!-- 服务门店 -->
					<view class="record-row">
						<text class="label">疗愈门店</text>
						<text class="value">{{ $filters.shoreNameFilter(record.shopId) }}</text>
					</view>

					<!-- 服务疗愈师 -->
					<view v-if="showMassagist(record)" class="record-row therapist-row">
						<text class="label">服务疗愈师</text>
						<view class="therapist-list">
							<view v-for="(orderDetail, tIndex) in record.orderDetailList" :key="tIndex"
								class="therapist-item">
								<view class="therapist-main">
									<image :src="orderDetail.massagist.avatarUrl" class="therapist-avatar"
										@click="previewImg(orderDetail.massagist.avatarUrl)" />
									<text class="therapist-name">{{ orderDetail.massagist.name }}</text>
								</view>
								<view class="therapist-quick">
									<view class="quick-btn"
										:class="{ active: orderDetail.massagist.isFavorited }"
										@click.stop="toggleFavorite(orderDetail.massagist)">
										<image class="quick-icon"
											:src="orderDetail.massagist.isFavorited?'/static/icons/shoucangselect.png':'/static/icons/favorite-therapist.png'"></image>
										<text>{{ orderDetail.massagist.isFavorited ? '已收藏' : '收藏' }}</text>
									</view>
									<view class="quick-btn"
										:class="{ muted: orderDetail.massagist.isBlocked }"
										@click.stop="toggleAvoid(orderDetail.massagist)">
										<image class="quick-icon"
											:src="orderDetail.massagist.isBlocked?'/static/icons/avoid-therapist-check.svg':'/static/icons/avoid-therapist.svg'"></image>
										<text>{{ orderDetail.massagist.isBlocked ? '已暂别' : '暂别' }}</text>
									</view>
								</view>
							</view>
						</view>
					</view>

					<!-- 操作按钮 :class="{ 'no-buttons': !hasVisibleButtons(record) }"-->
					<view class="action-buttons " >
						<view class="btn btn-cancel" @click.stop="cancelRecord(record)"
							v-if="(record.state == 0 || (record.state == 1 && record.appointmentState == 1)) &&(record.state == 0||isUpdButtonVisible(record))">
							取消预约
						</view>
						
						<view class="btn btn-cancel" @click.stop="AddSercie(record)"
							v-if="record.state == 1 && record.appointmentState == 1">
							<text> &nbsp;&nbsp;&nbsp;&nbsp;加钟&nbsp;&nbsp;&nbsp;&nbsp;</text>
						</view>
						<!-- <view class="btn btn-modify" @click.stop="modifyRecord(record)"
							v-if="record.state == 1 && record.appointmentState == 1 && isUpdButtonVisible(record)">修改
						</view> -->
						<view class="btn btn-modify pay" @click.stop="handleToPay(record)" v-if="record.state == 0">立即支付
							<view class="countdown-timer" v-if="record.state == 0 && record.cutdown">
								{{ record.cutDownDes }}
							</view>
						</view>
						<view class="btn btn-cancel" @click.stop="go_page_select_project(record)"
							v-if="(record.state == 3||record.appointmentState == 2||record.appointmentState == 3)">
							再次预约
						</view>
						<view class="btn btn-cancel"
							@click.stop="go_page_not_bar('/pages/user/order/order-detail?id='+record.id)"
							v-if="(record.appointmentState==2)">
							订单详情
						</view>
						<view @click.stop="opertionComment(record)" class="review-button-container"
							v-if="record.state == 1 && record.appointmentState == 2">
							<view class="review-reward-tag">
								<image src="/static/icons/reward-icon.png" class="reward-icon" />
								<text>评价有礼</text>
							</view>
							<view class="btn btn-review">
								评价服务
							</view>
						</view>
						<view class="btn btn-cancel " style="color:#DED9D1;border:1rpx solid #DED9D1 ;"
							v-if="record.state == 2 && record.appointmentState == 2">
							已评价
						</view>
					</view>
				</view>


			</view>

			<!--无单张券-->
			<view v-if="activeTab!=3 && data.tableData.length==0">
				<view class="flex justify-center pt-14">
					<image mode="widthFix" class="w-[200rpx] h-[160rpx]" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png"></image>
				</view>
				<view class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">这里空空如也</view>
			</view>


			<!-- 购买记录：会员卡 + 卡券订单合并，按时间倒序 -->
			<view v-if="activeTab==3" class="record-list  text-[#8A6A40]">
				<view v-if="brandLocked" class="purchase-lock">
					<text>品牌会员购买已暂停：{{ brandLockReason || '连续两次 7 天内退款，需联系工作人员解锁' }}</text>
				</view>
				<view v-if="brandLoading && !purchaseList.length" class="purchase-empty">正在读取购买记录…</view>
				<view v-else-if="!purchaseList.length" class="purchase-empty">还没有购买记录</view>
				<view v-for="row in purchaseList" :key="row.key" class="record-card">
					<view class="status default">
						<text>{{ row.kind === 'member' ? '会员卡' : '卡券' }}</text>
					</view>

					<!-- 品牌会员卡订单 -->
					<template v-if="row.kind === 'member'">
						<view class="record-row pt-5" style="border-top: 1rpx solid #EEECE8;">
							<text class="label">购买卡型</text>
							<text class="value">{{ row.raw.productName }}</text>
						</view>
						<view class="record-row pt-1">
							<text class="label">实付</text>
							<text class="value">¥{{ brandFormatYuan(brandPaidCents(row.raw)) }}</text>
						</view>
						<view class="record-row pt-1">
							<text class="label">状态</text>
							<text class="value">{{ row.raw.stateText }}</text>
						</view>
						<view v-if="row.raw.payTime" class="record-row pt-1">
							<text class="label">支付时间</text>
							<text class="value">{{ row.raw.payTime }}</text>
						</view>
						<text v-if="row.raw.refundState === 'SUCCESS'" class="purchase-note">
							已退款 ¥{{ brandFormatYuan(brandRefundCents(row.raw)) }}
						</text>
						<text v-else-if="row.raw.refundState === 'PENDING_CRM'" class="purchase-note">
							退款已退回，跨品牌权益撤销处理中
						</text>
						<text v-else-if="row.raw.state == 4 && row.raw.payError" class="purchase-note">
							开卡处理中：{{ row.raw.payError }}
						</text>
						<view class="action-buttons">
							<view class="review-button-container">
								<view class="btn btn-review" @click="go_page_brand_member">会员卡详情</view>
							</view>
							<view v-if="row.raw.refundable" class="review-button-container">
								<view class="btn btn-cancel" @click="openBrandRefund(row.raw)">申请退款</view>
							</view>
						</view>
					</template>

					<!-- 卡券 / 产品订单 -->
					<template v-else>
						<view class="record-row pt-5" style="border-top: 1rpx solid #EEECE8;">
							<text class="label">购买商品</text>
							<text class="value">{{ row.raw.productTitle }}</text>
						</view>
						<view class="record-row pt-1">
							<text class="label">价格</text>
							<text class="value">{{ row.raw.payAmount }}元</text>
						</view>
						<view v-if="row.raw.createTime" class="record-row pt-1">
							<text class="label">下单时间</text>
							<text class="value">{{ row.raw.createTime }}</text>
						</view>
						<view class="action-buttons">
							<view class="review-button-container">
								<view @click="go_page_card_detail(row.raw.id)" class="btn btn-review">
									订单详情
								</view>
							</view>
						</view>
					</template>
				</view>
				<text v-if="purchaseList.length" class="purchase-fine">
					会员卡 7 天内可自助退款（扣除已领年卡礼）；超过 7 天按「实付 − 已享会员优惠 − 已领年卡礼」退还，结果 ≤ 0 时不可退款。申请前会先显示可退金额。
				</text>
			</view>

			<view style="height: 100px;"></view>

			<CustomTabBar :selected="3" :list="tabBarList" />
			<!-- 

			<AddServiceAll v-if="true" ref="refAddServiceAll" :visible="showModal" :orderId="orderInfo"
				:showLotteryAfterSubmit="true" @cancel="hideModal" @submit="handleEvaluationSubmit" /> -->

			<AddService ref="refAddService" :visible="showAddServiceModel" :order="orderInfo"
				@cancel="hideAddServiceModal" @submit="handleAddServiceSubmit" />


			<!-- 评价弹框组件 -->
			<CommentFisrtModel :visible="showCommentModal" ref="refCommentFisrtModel" :order="currentCommentRecord"
				:therapists="currentCommentRecord?.orderDetailList.map(s=>s.massagist)"
				:orderId="String(currentCommentRecord?.id || '')" :showLotteryAfterSubmit="true"
				@cancel="hideCommentModal" @submit="handleCommentSubmit" />
			<!-- 支付 -->
			<PayModelPage :visible="showPaymentModal" :countdown="countdown" ref="payModelPageRef"
				@confirm="handlePaymentConfirm" @cancel="handlePaymentCancel" />

			<!-- 会员卡自助退款：打开时重新向服务端试算，金额与是否可退只认 CRM 结果 -->
			<view v-if="refundVisible" class="ord-mask" @click="closeBrandRefund">
				<view class="ord-sheet" @click.stop>
					<text class="ord-sheet-title">申请退款</text>
					<text class="ord-sheet-sub">{{ refundTarget && refundTarget.productName }} · {{ refundTarget && refundTarget.orderSn }}</text>
					<scroll-view scroll-y class="ord-sheet-body">
					<view class="ord-refund-box">
						<view class="ord-refund-row">
							<text>实付</text>
							<text>¥{{ brandFormatYuan(refundPreview.paidCents) }}</text>
						</view>
						<view v-if="refundPreview.showSaved" class="ord-refund-row">
							<text>已享会员优惠</text>
							<text>−¥{{ brandFormatYuan(refundPreview.savedCents) }}</text>
						</view>
						<view v-if="refundPreview.redeemedGiftCents" class="ord-refund-row">
							<text>已领年卡礼</text>
							<text>−¥{{ brandFormatYuan(refundPreview.redeemedGiftCents) }}</text>
						</view>
						<view class="ord-refund-row">
							<text>可退金额</text>
							<text class="ord-refund-total">{{ refundQuoting ? '试算中…' : '¥' + brandFormatYuan(refundPreview.refundCents) }}</text>
						</view>
						<text v-if="refundPreview.policy && refundPreview.canSubmit" class="ord-refund-policy">{{ refundPreview.policy }}</text>
						<text class="ord-refund-policy">{{ refundPreview.within7Days ? '开卡 7 天内：实付扣除已领取的年卡礼后退回。' : '已超过 7 天：实付扣除已享会员优惠与已领年卡礼后退回，结果 ≤ 0 时不可退款。' }}</text>
						<text v-if="refundPreview.deadline && refundPreview.within7Days" class="ord-refund-deadline">7 天退款窗口截止：{{ refundPreview.deadline }}</text>
					</view>
					<view v-if="!refundQuoting && refundPreview.blockText" class="ord-refund-warn">
						<text>{{ refundPreview.blockText }}</text>
					</view>
					<input v-if="refundPreview.canSubmit" class="ord-refund-input" v-model="refundReason" maxlength="100" placeholder="退款原因（选填）" />
					<text class="ord-refund-deadline">退款后会员权益立即终止，原路退回支付账户。</text>
					</scroll-view>
					<view class="ord-sheet-actions">
						<view class="ord-btn" @click="closeBrandRefund">{{ refundPreview.canSubmit ? '取消' : '知道了' }}</view>
						<view class="ord-btn primary" :class="{ disabled: refundQuoting || refundSubmitting || !refundPreview.canSubmit }"
							@click="submitBrandRefund">{{ refundSubmitting ? '退款处理中' : '确认退款' }}</view>
					</view>
				</view>
			</view>
		</view>

	</view>
</template>
<script setup>
	import {
		onLoad,
		onShareAppMessage,
		onShareTimeline,
		onShow,
		onPageScroll,
		onReachBottom
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
	import AddService from '../../../components/AddService.vue';
	import AddServiceAll from '../../../components/AddServiceAll.vue';
	import CustomTabBar from '../../../components/CustomTabBar.vue';
	import TopTitleNotBack from '../../../components/TopTitleNotBack.vue';
	import moment from 'moment';
	import orderApi from "../../../api/order"
	import massagistRateApi from "../../../api/massagistRate";
	import customerMassagistRelationApi from "../../../api/customerMassagistRelation"
	import customerMassagistBlockApi from "../../../api/customerMassagistBlock"
	import cookie from "../../../utils/cookieUtil"
	import constant from '@/consts/constant'
	import CommentFisrtModel from '../../../components/CommentFisrtModel'
	import debounce from "../../../utils/debounce";
	import productApi from "../../../api/product";
	import PayModelPage from '@/components/PayModelPage';
	import { loadBrandOrders, previewBrandRefund, refundBrandCard, isMock as brandIsMock, formatYuan as brandFormatYuan } from "../../../api/brandMember";
	import { normalizeRefundQuote } from "../../../utils/brandMemberPayload";

	const {
		proxy
	} = getCurrentInstance()
	const vm = proxy


	// 当前激活的标签页
	const activeTab = ref(0);
	// 购买记录：品牌会员卡单与卡券订单合并展示，退款资格一律以服务端返回为准。
	const brandOrders = ref([])
	const brandLocked = ref(false)
	const brandLockReason = ref('')
	const brandLoading = ref(false)
	const refundVisible = ref(false)
	const refundTarget = ref(null)
	const refundPreview = ref({})
	const refundReason = ref('')
	const refundQuoting = ref(false)
	const refundSubmitting = ref(false)
	const purchaseList = computed(() => {
		const rows = []
		brandOrders.value.forEach((row) => {
			rows.push({
				kind: 'member',
				key: 'm-' + row.orderSn,
				sortTime: row.createTime || row.payTime || '',
				raw: row
			})
		})
		data.tableData.forEach((row) => {
			rows.push({
				kind: 'product',
				key: 'p-' + row.id,
				sortTime: row.createTime || row.startTime || '',
				raw: row
			})
		})
		return rows.sort((a, b) => String(b.sortTime).localeCompare(String(a.sortTime)))
	})
	const tableData1 = reactive([{
		id: 12991,
		state: 1,
		appointmentState: 2,
		startTime: '2026-01-12 10:30:00'
	}, {
		id: 12990,
		state: 1,
		appointmentState: 2,
		startTime: '2026-01-12 10:30:00'
	}])


	const customBar = ref(0)
	const statusBar = ref(0)
	let showModal = ref(false)
	let orderInfo = ref([])

	//请求参数
	const params = reactive({
		page: 1,
		size: 5,
		type: 0,
		order: '-id',
	}) /* appointment_state, */
	const {
		page,
		size
	} = toRefs(params)

	//订单记录与总数
	const data = reactive({
		tableData: [],
		total: 0
	})
	const {
		tableData,
		total
	} = toRefs(data)
	/* // 标签页数据
	const tabs = ref([
	  {name: '进行中', status: '0,1'},
	  {name: '已完成', status: '2'},
	  {name: '已取消', status: '3'},
	  {name: '全部', status: ''},
	]); */
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
	onShow(() => {
		// 会员卡页跳转过来时指定目标 tab；orderShowIndex 仍保留原有的详情页返回逻辑。
		const jumpTab = getApp().globalData.orderTabJump
		if (typeof jumpTab === 'number' && jumpTab >= 0 && jumpTab < tabs.value.length) {
			getApp().globalData.orderTabJump = null
			switchTab(jumpTab)
			return
		}
		searchData()
		let index=getApp().globalData.orderShowIndex
		if(index==0){
			switchTab(0)
		}else{
			getApp().globalData.orderShowIndex=0
		}
		
	})
	// 取消按钮
	const cancelRecord = (record) => {
		if (!isUpdButtonVisible(record)&&record.state==1) {
			uni.showToast({
				title: '服务即将开始',
				icon: 'none'
			});
			return
		}
		uni.showModal({
			title: '提示',
			content: '确定要取消这个预约吗？',
			confirmText: '确定',
			cancelText: "取消",
			success: async (res) => {
				if (res.confirm) {
					uni.showLoading({
						title:'处理中！'
					})
					await orderApi.cancelOrder(record.id, '客户操作取消')
					searchData()
					uni.hideLoading()
					uni.showToast({
						title: '已取消预约',
						icon: 'success'
					});
					cookie.updCouponCount()
					cookie.updIntegration()
				}
			}
		});
	}
	//去支付按钮
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
			searchData()
		}


	}
	//加钟模块
	const countdown = ref(0)
	const showAddServiceModel = ref(false)
	const payModelPageRef = ref(null)
	// 支付弹框显示状态
	const showPaymentModal = ref(false);
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
	const handlePaymentConfirm = (paymentData) => {
		console.log('支付信息:', paymentData);
		showPaymentModal.value = false;
		cookie.updCouponCount()
		cookie.updIntegration()
		if (paymentData == 'notpay') {
			//searchData()
			uni.showToast({
				title: '未支付！',
				icon:"error"
			});
		} else {
			searchData()
			uni.showToast({
				title: '支付成功！',
			});
		}
	}
	const handlePaymentCancel = () => {
		showPaymentModal.value = false;
		//searchData()
		/* uni.showLoading({
			title: '未完成支付！',
			mask: true,
		})
		setTimeout(() => {
			uni.hideLoading()
		}, 1000) */
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
		searchData()
		// 隐藏弹框
		hideCommentModal()
	}

	const searchData = () => {
		params.page = 1
		fetchData()
	}
	//获取订单
	const fetchData = async () => {
		if (cutDownTimer) {
			clearInterval(cutDownTimer)
		}
		if (activeTab.value == 3) {
			params.type = 1 //卡券订单
		} else {
			params.type = 0 //产品订单
		}
		const brandPromise = activeTab.value == 3 ? loadBrandPurchaseOrders() : Promise.resolve()
		const {
			list,
			total
		} = await orderApi.getPage({
			...params,
			appointmentState: tabs.value[activeTab.value].status
		})
		await brandPromise
		
		const currentTimeNew = new Date();
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
			o.startTime = moment(o.startTime).format('YYYY-MM-DD HH:mm')
		})
		startCountdown()
		if (params.page == 1) {
			data.tableData = list || []
		} else {
			data.tableData = [...data.tableData, ...list]
		}
		await loadMassagistPreferences()
		// 切换标签后总数必须按当前筛选重算，否则触底分页会沿用上个标签的 total 提前停止
		data.total = total || 0
	}


	/** 品牌会员卡订单：与卡券订单合并展示；接口失败只影响该区块，不影响卡券列表。 */
	const loadBrandPurchaseOrders = async () => {
		if (brandIsMock) return
		brandLoading.value = true
		try {
			const res = await loadBrandOrders()
			brandLocked.value = !!(res && res.locked)
			brandLockReason.value = (res && res.lockReason) || ''
			brandOrders.value = res && Array.isArray(res.orders) ? res.orders : []
		} catch (e) {
			brandOrders.value = []
		} finally {
			brandLoading.value = false
		}
	}

	const brandPaidCents = (row) => {
		if (row && row.paidCents != null) return Number(row.paidCents) || 0
		return Math.round(Number((row && row.amount) || 0) * 100)
	}

	const brandRefundCents = (row) => Math.round(Number((row && row.refundAmount) || 0) * 100)

	const openBrandRefund = async (row) => {
		if (!row) return
		refundTarget.value = row
		// 先用列表随行的试算占位，打开后立即向服务端重新试算，避免列表停留过久金额过期
		refundPreview.value = normalizeRefundQuote({
			...row,
			paidCents: brandPaidCents(row)
		})
		refundReason.value = ''
		refundVisible.value = true
		refundQuoting.value = true
		try {
			const fresh = await previewBrandRefund(row.orderSn)
			if (refundTarget.value === row) refundPreview.value = normalizeRefundQuote(fresh)
		} catch (e) {
			if (refundTarget.value === row) {
				refundPreview.value = normalizeRefundQuote({
					paidCents: brandPaidCents(row),
					allowed: false,
					refundQuoteError: brandErrorText(e, '退款试算暂时不可用，请稍后重试')
				})
			}
		} finally {
			refundQuoting.value = false
		}
	}

	const brandErrorText = (e, fallback) => {
		if (typeof e === 'string' && e) return e
		if (e && typeof e.message === 'string' && e.message) return e.message
		if (e && e.data && typeof e.data.message === 'string' && e.data.message) return e.data.message
		return fallback
	}

	const closeBrandRefund = () => {
		if (refundSubmitting.value) return
		refundVisible.value = false
	}

	const submitBrandRefund = async () => {
		const target = refundTarget.value
		if (!target || refundSubmitting.value || refundQuoting.value) return
		const preview = refundPreview.value || {}
		if (!preview.canSubmit) {
			uni.showToast({
				title: preview.blockText || '当前不可在线退款',
				icon: 'none'
			})
			return
		}
		refundSubmitting.value = true
		uni.showLoading({
			title: '正在退款',
			mask: true
		})
		try {
			const res = await refundBrandCard({
				orderSn: target.orderSn,
				reason: refundReason.value.trim()
			})
			uni.hideLoading()
			refundVisible.value = false
			const lines = [`已退款 ¥${brandFormatYuan(Math.round(Number((res && res.refundAmount) || 0) * 100))}，会员权益已终止。`]
			if (res && res.warning) lines.push(res.warning)
			if (res && res.customerLocked) {
				lines.push('连续两次 7 天内退款，品牌会员购买已暂停；如需再次购买，请联系工作人员解锁。')
			}
			uni.showModal({
				title: '退款已提交',
				content: lines.join('\n'),
				showCancel: false
			})
			searchData()
		} catch (e) {
			uni.hideLoading()
			uni.showToast({
				title: brandErrorText(e, '退款失败，请稍后重试'),
				icon: 'none'
			})
		} finally {
			refundSubmitting.value = false
		}
	}

	const go_page_brand_member = () => {
		uni.navigateTo({
			url: '/pages/user/brand-member/brand-member'
		})
	}

	let cutDownTimer = null;
	const startCountdown = () => {
		if (cutDownTimer) clearInterval(cutDownTimer);
		cutDownTimer = setInterval(() => {
			data.tableData.forEach(o => {
				if (o.state == 0 && o.cutdown > 0) {
					o.cutdown = Math.max(0, o.cutdown - 1)
					o.cutDownDes = getCutDown(o)
					if (o.cutdown == 0) {
						o.state = 3
						o.appointmentState=3
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

	//列表内快捷收藏/暂别：一次性加载关系与暂别名单
	const loadMassagistPreferences = async () => {
		try {
			const [relationData, blockPage] = await Promise.all([
				customerMassagistRelationApi.getList(),
				customerMassagistBlockApi.getPage({ page: 1, size: 300 })
			])
			const relations = relationData || []
			const blocks = (blockPage && blockPage.list) || []
			data.tableData.forEach(record => {
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
			//偏好加载失败不影响订单展示
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



	const AddServiceSubmit = () => {
		console.log(33)
		showModal.value = true
	}
	const hideModal = () => {
		showModal.value = false
	}
	//分享订单
	const go_page_share = (orderId) => {
		uni.navigateTo({
			url: '/pages/index/pay-success/appointment-success?topdisplayStatus=false&orderId=' +
				orderId
		})
	}
	// 检查是否有可见按钮
	const hasVisibleButtons = (record) => {
		const hasCancelButton = (record.state == 0 || (record.state == 1 && record.appointmentState ==
				1)) &&
			isUpdButtonVisible(record);
		const hasModifyButton = record.state == 1 && record.appointmentState == 1 &&
			isUpdButtonVisible(record);
		const hasPayButton = record.state == 0;
		const hasReviewButton = record.state == 1 && record.appointmentState == 2;

		return hasCancelButton || hasModifyButton || hasPayButton || hasReviewButton;
	}
	// 显示疗愈师
	const showMassagist = (record) => {
		let show = false
		record.orderDetailList.forEach(s => {
			if (s.massagistId && s.massagistId != 0) {
				if (s.specifyType) {
					show = true
				} else if (s.state == 1 || s.state == 2) {
					show = true
				}
			}
		})
		return show
	}
	// 检查时间条件
	const isUpdButtonVisible = (record) => {
		const currentTime = moment();
		const startTime = moment(record.startTime);
		return currentTime.isBefore(startTime.subtract(30, 'minutes'));
	};
	/* 愈疗师头像图片放大 */
	const previewImg = (url) => {
		uni.previewImage({
			urls: [url]
		})
	}

	function submittest() {
		console.log("-----");
	}
	// 切换标签页
	const switchTab = (index) => {
		activeTab.value = index
		searchData()
	};
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
	const go_page_card_detail = (orderId) => {
		getApp().globalData.orderShowIndex=1
		uni.navigateTo({
			url: '/pages/user/order/order-product-detail?orderId=' + orderId
		})
	}
	const go_page_not_bar = (path) => {
		getApp().globalData.orderShowIndex=1
		uni.navigateTo({
			url: path
		})
	}
	const go_page_select_project = (record) => {
		
		console.log(record)
		console.log(record.shopId)
		if (record.orderDetailList[0].massagist != null) {
			uni.navigateTo({
				url: '/pages/index/select-project?projectId='+record.orderDetailList[0].projectId+'&projectMinute='+record.orderDetailList[0].duration+'&massagistName=' + record.orderDetailList[0].massagist.name +
					'&massagistId=' + record.orderDetailList[0].massagist.id + '&shopId=' + record.orderDetailList[0].massagist.shopId
			})
		} else {
			uni.navigateTo({
				url: '/pages/index/select-project?projectId='+record.orderDetailList[0].projectId+'&projectMinute='+record.orderDetailList[0].duration+'&shopId=' + record.shopId
			})
		}
	}
	const tabs = ref([{
			name: '全部',
			status: ''
		},
		{
			name: '已完成',
			status: '2'
		},
		{
			name: '已取消',
			status: '3'
		},
		{
			// 购买记录：卡券订单与品牌会员卡订单合并展示，不按预约状态过滤
			name: '卡券与会员',
			status: ''
		}
	]);
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
	const shop=ref([])
	onShareAppMessage(async (res) => {
		console.log(res)
		let shopList = cookie.getStoreList()
		
		shop.value=shopList.filter(t => {
			return t.id == res.target.dataset.shopid
		});
		console.log(shop.value)
		
		let name=cookie.getNickname()
		return {
			title: "邀请好友共同Full愈", // 卡片标题
			path: '/pages/index/pay-success/appointment-share?custName='+name+'&orderId='+res.target.dataset.id, // 携带参数
			imageUrl: shop.value[0].coverImageUrls // 1:1 比例缩略图
		}
	})
</script>
<style lang="less" scoped>
	.btn {
		padding: 9rpx 20rpx;
	}

	.review-button-container {
		position: relative;
		display: inline-block;
		/* or flex, adjust as needed */
		/* margin-left: 10px; */
		/* Adjust spacing from other buttons if necessary */
	}

	.pay {
		position: relative;
	}

	.countdown-timer {
		position: absolute;
		top: -20rpx;
		right: -20rpx;
		background-color: #fde2e2;
		color: #f56c6c;
		padding: 4rpx 12rpx;
		border-radius: 20rpx;
		font-size: 20rpx;
		line-height: 1.2;
		white-space: nowrap;
	}

	.review-reward-tag {
		position: absolute;
		top: -12px; // Adjust to position above the button
		left: 66%;
		transform: translateX(-50%);
		background-color: #FEE3E3; // Light pinkish background
		color: #FA5151; // Reddish text color
		padding: 3px 8px;
		border-radius: 10px;
		font-size: 10px;
		display: flex;
		align-items: center;
		white-space: nowrap;
		z-index: 1; // Ensure it's above the button

		.reward-icon {
			width: 12px;
			height: 12px;
			margin-right: 4px;
		}
	}

	// Adjust existing button style if it's pushed down by the tag
	.action-buttons {
		border-top: 2rpx solid #f0f0f0;
		padding-top: 32rpx;
		margin-top: 32rpx;

		&.no-buttons {
			border-top: none;
			padding-top: 0;
			margin-top: 0;
		}

		.btn-review {
			margin-top: 5px; // Add some top margin to the button itself if the tag overlaps or pushes it
		}
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
			font-size: 28rpx;

			position: relative;
			transition: color 0.3s;

			&.active {
				/* font-size: 34upx; */
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

	// 记录列表
	.record-list {
		padding: 32rpx 40rpx;

		.empty-wrapper {
			display: flex;
			flex-direction: column;
			align-items: center;
			padding: 120rpx 0;
			min-height: 60vh;
		}

		// 记录卡片
		.record-card {
			position: relative;
			background-color: #fff;
			border-radius: 32rpx;
			padding: 60rpx 60rpx 32rpx;
			margin-bottom: 24rpx;
			box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);

			&:last-child {
				margin-bottom: 0;
			}

			.status {
				position: absolute;
				top: 0;
				left: 0;
				width: fit-content;
				font-size: 24rpx;
				border-radius: 32rpx 0 16upx 0;
				width: 160rpx;
				height: 60rpx;
				text-align: center;
				line-height: 60rpx;

				&.red {
					background-color: #C5B69D;
					color: #584219;
				}

				&.green {
					background-color: #C5B69D;
					color: #584219;
				}

				&.cancelled {
					background-color: #F1EFEC;
					color: #B3AFA9 !important;
				}

				&.default {
					background-color: #E8DFD0;
					color: #584219;
				}
			}

			// 记录行
			.record-row {
				display: flex;
				justify-content: space-between;
				align-items: flex-start;
				margin-bottom: 24rpx;


				&:last-child {
					margin-bottom: 0;
				}

				.label {
					font-size: 28rpx;
					color: #8A6A40;
					min-width: 140upx;
				}

				.value {
					font-size: 28rpx;
					color: #584219;
					font-weight: 500;
					flex: 1;
					text-align: right;
				}
			}

			// 疗愈师行特殊样式：名字右侧直接给收藏/暂别快捷入口
			.therapist-row {
				align-items: flex-start;

				.therapist-list {
					display: flex;
					flex-direction: column;
					gap: 14upx;
					flex: 1;
					min-width: 0;
					align-items: stretch;
				}

				.therapist-item {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 12upx;
					width: 100%;

					.therapist-main {
						display: flex;
						align-items: center;
						gap: 10upx;
						min-width: 0;
						flex: 1;
					}

					.therapist-avatar {
						width: 48upx;
						height: 48upx;
						border-radius: 50%;
						background-color: #f0f0f0;
					}

					.therapist-name {
						font-size: 24rpx;
						color: #584219;
						overflow: hidden;
						white-space: nowrap;
						text-overflow: ellipsis;
					}

					.therapist-quick {
						display: flex;
						align-items: center;
						gap: 10upx;
						flex-shrink: 0;
					}

					.quick-btn {
						display: flex;
						align-items: center;
						gap: 6upx;
						padding: 6upx 14upx;
						border: 1rpx solid #E4DCD5;
						border-radius: 999upx;
						font-size: 22rpx;
						color: #8A6A40;
						background-color: #FFFFFF;

						&.active {
							border-color: #C5B69D;
							background-color: #F6F4F2;
							color: #584219;
						}

						&.muted {
							border-color: #DED9D1;
							background-color: #FAF9F7;
							color: #9A948C;
						}
					}

					.quick-icon {
						width: 28upx;
						height: 28upx;
					}
				}
			}
		}
	}
	.transparent-share-btn {
	  position: absolute;
	  top: 0;
	  left: 0;
	  width: 100%;
	  height: 100%;
	  background-color: transparent; /* 关键：设置为透明 */
	  border: none; /* 关键：移除默认边框 */
	  opacity: 0; /* 关键：设置为完全透明 */
	  z-index: 10; /* 确保在图片上方 */
	}

	/* 购买记录：会员卡 + 卡券合并 */
	.purchase-lock {
		margin-bottom: 24rpx;
		padding: 20rpx 28rpx;
		border-radius: 20rpx;
		background: #F6EEE7;
		font-size: 22rpx;
		line-height: 1.7;
		color: #8A5A32;
	}

	.purchase-empty {
		padding: 120rpx 0;
		text-align: center;
		font-size: 24rpx;
		color: #A89880;
	}

	.purchase-note {
		display: block;
		margin-top: 8rpx;
		font-size: 22rpx;
		line-height: 1.6;
		color: #6B7A5A;
	}

	.purchase-fine {
		display: block;
		margin-top: 24rpx;
		font-size: 20rpx;
		line-height: 1.7;
		color: #A89880;
	}

	.ord-mask {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 2000;
		display: flex;
		align-items: flex-end;
		background: rgba(43, 33, 22, 0.45);
	}

	.ord-sheet {
		width: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		max-height: 92vh;
		padding: 32rpx 32rpx;
		padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
		border-radius: 28rpx 28rpx 0 0;
		background: #F6F4F2;
	}

	/* 内容多时只滚中间区域，标题和底部按钮始终可见 */
	.ord-sheet-body {
		max-height: 62vh;
		padding-bottom: 4rpx;
	}

	.ord-sheet-title {
		display: block;
		font-size: 34rpx;
		letter-spacing: 0.06em;
		color: #3B3128;
	}

	.ord-sheet-sub {
		display: block;
		margin-top: 8rpx;
		font-size: 21rpx;
		color: #A89880;
	}

	.ord-refund-box {
		margin-top: 20rpx;
		padding: 22rpx;
		border-radius: 18rpx;
		background: #FFFFFF;
	}

	.ord-refund-row {
		display: flex;
		justify-content: space-between;
		padding: 8rpx 0;
		font-size: 24rpx;
		color: #6A5334;
	}

	.ord-refund-total {
		font-size: 30rpx;
		color: #3B3128;
	}

	.ord-refund-policy {
		display: block;
		margin-top: 12rpx;
		font-size: 21rpx;
		line-height: 1.7;
		color: #8A7A64;
	}

	.ord-refund-deadline {
		display: block;
		margin-top: 6rpx;
		font-size: 20rpx;
		color: #A5742F;
	}

	.ord-refund-input {
		box-sizing: border-box;
		height: 88rpx;
		margin-top: 18rpx;
		padding: 0 22rpx;
		border-radius: 16rpx;
		background: #FFFFFF;
		font-size: 24rpx;
		color: #3B3128;
	}

	.ord-refund-warn {
		margin-top: 16rpx;
		padding: 18rpx 22rpx;
		border-radius: 16rpx;
		background: #F8EDE6;
		font-size: 21rpx;
		line-height: 1.7;
		color: #8A5A32;
	}

	.ord-sheet-actions {
		display: flex;
		gap: 18rpx;
		margin-top: 26rpx;
	}

	.ord-btn {
		flex: 1;
		height: 84rpx;
		line-height: 84rpx;
		border-radius: 999rpx;
		text-align: center;
		font-size: 26rpx;
		letter-spacing: 0.04em;
		color: #584219;
		background: #FFFFFF;
		border: 1rpx solid #E4DCD5;
	}

	.ord-btn.primary {
		color: #F6F4F2;
		background: #584219;
		border-color: #584219;
	}

	.ord-btn.disabled {
		opacity: 0.45;
	}

</style>