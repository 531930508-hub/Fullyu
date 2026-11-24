<template>
	<view class="min-h-screen bg-[#F6F4F2] text-[#8A6A40] " :class="localeClass()">
		<TopTitleNotBack></TopTitleNotBack>
		<view class="tab-nav" :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">
			<view v-for="(tab, index) in tabs" :key="index" :class="['tab-item', { active: activeTab === index }]"
				@click="switchTab(index)">
				{{ t(tab.name) }}
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
						<text v-if="record.state == 0">{{ t('未付款') }}</text>
						<text v-else-if="record.state == 1 && record.appointmentState == 1">{{ t('进行中') }}</text>
						<text v-else-if="record.state == 1 && record.appointmentState == 2">{{ t('已完成') }}</text>
						<text v-else-if="record.state == 2">{{ t('已完成') }}</text>
						<text v-else-if="record.appointmentState == 3">{{ t('已取消') }}</text>
						<text v-else-if="record.state == 6">{{ t('已退款') }}</text>
						<text v-else-if="record.state == 5">{{ t('退款中') }}</text>
						<text v-else-if="record.state == 7">{{ t('退款中') }}</text>
					</view>
					<view v-if="record.state == 1 && record.appointmentState == 1"
						style="width: 80rpx;position: absolute;top: 15rpx;right: 55rpx;">
						<image open-type="share" src="/static/icons/external-link.png" class="w-[35rpx] h-[35rpx]" style="float: right;">
						</image>
						<button :data-id="record.id" :data-shopId="record.shopId" class="transparent-share-btn" open-type="share"></button>
					</view>
					
					<view class="record-row pt-3" style="border-top: 1rpx solid #EEECE8;">
						<text class="label">{{ t('项目名称') }}</text>
						<text class="value">{{ $filters.projectTitleFilter(record.orderDetailList?.[0].projectId) }}</text>
					</view>
					<!-- 开始时间 -->
					<view class="record-row " >
						<text class="label">{{ t('开始时间') }}</text>
						<text class="value">{{ record.startTime }}</text>
					</view>

					<!-- 放松时长 -->
					<view class="record-row">
						<text class="label">{{ t('疗愈时长') }}</text>
						<text class="value">{{ record.duration }} mins</text>
					</view>

					<!-- 服务门店 -->
					<view class="record-row">
						<text class="label">{{ t('疗愈门店') }}</text>
						<text class="value">{{ $filters.shoreNameFilter(record.shopId) }}</text>
					</view>

					<!-- 服务疗愈师 -->
					<view v-if="showMassagist(record)" class="record-row therapist-row">
						<text class="label">{{ t('服务疗愈师') }}</text>
						<view class="therapist-list">
							<view v-for="(orderDetail, tIndex) in record.orderDetailList" :key="tIndex"
								class="therapist-item">
								<view class="therapist-main">
									<image :src="img(orderDetail.massagist.avatarUrl, 150)" :webp="true" class="therapist-avatar"
										@click="previewImg(orderDetail.massagist.avatarUrl)" />
									<text class="therapist-name">{{ orderDetail.massagist.name }}</text>
								</view>
								<view class="therapist-quick">
									<view class="quick-btn"
										:class="{ active: orderDetail.massagist.isFavorited }"
										@click.stop="toggleFavorite(orderDetail.massagist)">
										<image class="quick-icon"
											:src="orderDetail.massagist.isFavorited?'/static/icons/shoucangselect.png':'/static/icons/favorite-therapist.png'"></image>
										<text>{{ orderDetail.massagist.isFavorited ? t('已收藏') : t('收藏') }}</text>
									</view>
									<view class="quick-btn"
										:class="{ muted: orderDetail.massagist.isBlocked }"
										@click.stop="toggleAvoid(orderDetail.massagist)">
										<image class="quick-icon"
											:src="orderDetail.massagist.isBlocked?'/static/icons/avoid-therapist-check.svg':'/static/icons/avoid-therapist.svg'"></image>
										<text>{{ orderDetail.massagist.isBlocked ? t('已暂别') : t('暂别') }}</text>
									</view>
								</view>
							</view>
						</view>
					</view>

					<!-- 操作按钮 :class="{ 'no-buttons': !hasVisibleButtons(record) }"-->
					<view class="action-buttons " >
						<view class="btn btn-cancel" @click.stop="cancelRecord(record)"
							v-if="(record.state == 0 || (record.state == 1 && record.appointmentState == 1)) &&(record.state == 0||isUpdButtonVisible(record))">
							{{ t('取消预约') }}
						</view>
						
						<view class="btn btn-cancel" @click.stop="AddSercie(record)"
							v-if="record.state == 1 && record.appointmentState == 1">
							<text> {{ t('&nbsp;&nbsp;&nbsp;&nbsp;加钟&nbsp;&nbsp;&nbsp;&nbsp;') }}</text>
						</view>
						<!-- <view class="btn btn-modify" @click.stop="modifyRecord(record)"
							v-if="record.state == 1 && record.appointmentState == 1 && isUpdButtonVisible(record)">修改
						</view> -->
						<view class="btn btn-modify pay" @click.stop="handleToPay(record)" v-if="record.state == 0">{{ t('立即支付') }}
							<view class="countdown-timer" v-if="record.state == 0">
								{{ record.cutDownDes }}
							</view>
						</view>
						<view class="btn btn-cancel" @click.stop="go_page_select_project(record)"
							v-if="(record.state == 3||record.appointmentState == 2||record.appointmentState == 3)">
							{{ t('再次预约') }}
						</view>
						<view class="btn btn-cancel"
							@click.stop="go_page_not_bar('/pages/user/order/order-detail?id='+record.id)"
							v-if="(record.appointmentState==2)">
							{{ t('订单详情') }}
						</view>
						<view @click.stop="opertionComment(record)" class="review-button-container"
							v-if="record.state == 1 && record.appointmentState == 2">
							<view class="review-reward-tag">
								<image src="/static/icons/reward-icon.png" class="reward-icon" />
								<text>{{ t('评价有礼') }}</text>
							</view>
							<view class="btn btn-review">
								{{ t('评价服务') }}
							</view>
						</view>
						<view class="btn btn-cancel " style="color:#DED9D1;border:1rpx solid #DED9D1 ;"
							v-if="record.state == 2 && record.appointmentState == 2">
							{{ t('已评价') }}
						</view>
					</view>
				</view>


			</view>

			<!--无单张券-->
			<view v-if="activeTab!=3 && data.tableData.length==0">
				<view class="flex justify-center pt-14">
					<image mode="widthFix" class="w-[200rpx] h-[160rpx]" :src="img('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png', 300)" :webp="true"></image>
				</view>
				<view class="flex justify-center pt-4 pb-8 text-[#584219] text-[24rpx]">{{ t('这里空空如也') }}</view>
			</view>


			<!-- 购买记录：会员卡 + 卡券订单合并，按时间倒序 -->
			<view v-if="activeTab==3" class="record-list  text-[#8A6A40]">
				<view v-if="brandLocked" class="purchase-lock">
					<text>{{ t('品牌会员购买已暂停：') }}{{ brandLockReason || t('连续两次 7 天内退款，需联系工作人员解锁') }}</text>
				</view>
				<view v-if="brandLoading && !purchaseList.length" class="purchase-empty">{{ t('正在读取购买记录…') }}</view>
				<view v-else-if="!purchaseList.length" class="purchase-empty">{{ t('还没有购买记录') }}</view>
				<view v-for="row in purchaseList" :key="row.key" class="record-card">
					<view class="status default">
						<text>{{ row.kind === 'member' ? t('会员卡') : t('卡券') }}</text>
					</view>

					<!-- 品牌会员卡订单 -->
					<template v-if="row.kind === 'member'">
						<view class="record-row pt-5" style="border-top: 1rpx solid #EEECE8;">
							<text class="label">{{ t('购买卡型') }}</text>
							<text class="value">{{ row.raw.productName }}</text>
						</view>
						<view class="record-row pt-1">
							<text class="label">{{ t('实付') }}</text>
							<text class="value">¥{{ brandFormatYuan(brandPaidCents(row.raw)) }}</text>
						</view>
						<view class="record-row pt-1">
							<text class="label">{{ t('状态') }}</text>
							<text class="value">{{ row.raw.stateText }}</text>
						</view>
						<view v-if="row.raw.payTime" class="record-row pt-1">
							<text class="label">{{ t('支付时间') }}</text>
							<text class="value">{{ row.raw.payTime }}</text>
						</view>
						<text v-if="row.raw.refundState === 'SUCCESS'" class="purchase-note">
							{{ t('已退款 ¥') }}{{ brandFormatYuan(brandRefundCents(row.raw)) }}
						</text>
						<text v-else-if="row.raw.refundState === 'PENDING_CRM'" class="purchase-note">
							{{ t('退款已退回，跨品牌权益撤销处理中') }}
						</text>
						<text v-else-if="row.raw.state == 4 && row.raw.payError" class="purchase-note">
							{{ t('开卡处理中：') }}{{ row.raw.payError }}
						</text>
						<view class="action-buttons">
							<view class="review-button-container">
								<view class="btn btn-review" @click="go_page_brand_member">{{ t('会员卡详情') }}</view>
							</view>
							<view v-if="row.raw.refundable" class="review-button-container">
								<view class="btn btn-cancel" @click="openBrandRefund(row.raw)">{{ t('申请退款') }}</view>
							</view>
						</view>
					

					</template>
					<!-- 卡券 / 产品订单 -->
					<template v-else>
						<view class="record-row pt-5" style="border-top: 1rpx solid #EEECE8;">
							<text class="label">{{ t('购买商品') }}</text>
							<text class="value">{{ row.raw.productTitle }}</text>
						</view>
						<view class="record-row pt-1">
							<text class="label">{{ t('价格') }}</text>
							<text class="value">{{ row.raw.payAmount }}{{ t('元') }}</text>
						</view>
						<view v-if="row.raw.createTime" class="record-row pt-1">
							<text class="label">{{ t('下单时间') }}</text>
							<text class="value">{{ row.raw.createTime }}</text>
						</view>
						<view class="action-buttons">
							<view class="review-button-container">
								<view @click="go_page_card_detail(row.raw.id)" class="btn btn-review">
									{{ t('订单详情') }}
								</view>
							</view>
						</view>
					</template>
				</view>
				<text v-if="purchaseList.length" class="purchase-fine">
					{{ t('会员卡 7 天内可自助退款（扣除已领会员礼）；超过 7 天按「实付 − 已享会员优惠 − 已领会员礼」退还，结果 ≤ 0 时不可退款。申请前会先显示可退金额。') }}
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
				:therapists="currentCommentRecord?.orderDetailList?.map(s=>s.massagist).filter(Boolean)"
				:orderId="String(currentCommentRecord?.id || '')" :showLotteryAfterSubmit="true"
				@cancel="hideCommentModal" @submit="handleCommentSubmit" />
			<!-- 支付 -->
			<PayModelPage :visible="showPaymentModal" :deadline="payDeadline" ref="payModelPageRef"
				@confirm="handlePaymentConfirm" @cancel="handlePaymentCancel" />

			<!-- 会员卡自助退款：打开时重新向服务端试算，金额与是否可退只认 CRM 结果 -->
			<view v-if="refundVisible" class="ord-mask" @click="closeBrandRefund">
				<view class="ord-sheet" @click.stop>
					<text class="ord-sheet-title">{{ t('申请退款') }}</text>
					<text class="ord-sheet-sub">{{ refundTarget && refundTarget.productName }} · {{ refundTarget && refundTarget.orderSn }}</text>
					<scroll-view scroll-y class="ord-sheet-body">
					<view class="ord-refund-box">
						<view class="ord-refund-row">
							<text>{{ t('实付') }}</text>
							<text>¥{{ brandFormatYuan(refundPreview.paidCents) }}</text>
						</view>
						<view v-if="refundPreview.showSaved" class="ord-refund-row">
							<text>{{ t('已享会员优惠') }}</text>
							<text>−¥{{ brandFormatYuan(refundPreview.savedCents) }}</text>
						</view>
						<view v-if="refundPreview.redeemedGiftCents" class="ord-refund-row">
							<text>{{ t('已领会员礼') }}</text>
							<text>−¥{{ brandFormatYuan(refundPreview.redeemedGiftCents) }}</text>
						</view>
						<view class="ord-refund-row">
							<text>{{ t('可退金额') }}</text>
							<text class="ord-refund-total">{{ refundQuoting ? t('试算中…') : '¥' + brandFormatYuan(refundPreview.refundCents) }}</text>
						</view>
						<text v-if="refundPreview.policy && refundPreview.canSubmit" class="ord-refund-policy">{{ refundPreview.policy }}</text>
						<text class="ord-refund-policy">{{ refundPreview.within7Days ? t('开卡 7 天内：实付扣除已领取的会员礼后退回。') : t('已超过 7 天：实付扣除已享会员优惠与已领会员礼后退回，结果 ≤ 0 时不可退款。') }}</text>
						<text v-if="refundPreview.deadline && refundPreview.within7Days" class="ord-refund-deadline">{{ t('7 天退款窗口截止：') }}{{ refundPreview.deadline }}</text>
					</view>
					<view v-if="!refundQuoting && refundPreview.blockText" class="ord-refund-warn">
						<text>{{ refundPreview.blockText }}</text>
					</view>
					<input v-if="refundPreview.canSubmit" class="ord-refund-input" v-model="refundReason" maxlength="100" :placeholder="t('退款原因（选填）')" />
					<text class="ord-refund-deadline">{{ t('退款后会员权益立即终止，原路退回支付账户。') }}</text>
					</scroll-view>
					<view class="ord-sheet-actions">
						<view class="ord-btn" @click="closeBrandRefund">{{ refundPreview.canSubmit ? t('取消') : t('知道了') }}</view>
						<view class="ord-btn primary" :class="{ disabled: refundQuoting || refundSubmitting || !refundPreview.canSubmit }"
							@click="submitBrandRefund">{{ refundSubmitting ? t('退款处理中') : t('确认退款') }}</view>
					</view>
				</view>
			</view>
		</view>

	</view>
</template>

<script setup>
	import { t } from '../../../utils/locale'
	import { img } from '../../../utils/imageLocale'
	import {
		onLoad,
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
	import massagistRateApi from "../../../api/MassagistRate";
	import customerMassagistRelationApi from "../../../api/customerMassagistRelation"
	import customerMassagistBlockApi from "../../../api/customerMassagistBlock"
	import cookie from "../../../utils/cookieUtil"
	import constant from '@/consts/constant'
	import { shareImg } from '../../../utils/image'
	import { defaultShareMessage, registerShareHandler } from '@/utils/share'
	import CommentFisrtModel from '../../../components/CommentFisrtModel'
	import debounce from "../../../utils/debounce";
	import productApi from "../../../api/product";
	import PayModelPage from '@/components/PayModelPage';
	import { loadBrandOrders, previewBrandRefund, refundBrandCard, isMock as brandIsMock, formatYuan as brandFormatYuan } from "../../../api/brandMember";
	import { normalizeRefundQuote } from "../../../utils/brandMemberPayload";
	import { applyUnpaidCountdowns, tickUnpaidCountdowns, payDeadlineMs, formatCountdownClock } from "../../../utils/unpaidOrders";

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
	  {name: t('进行中'), status: '0,1'},
	  {name: t('已完成'), status: '2'},
	  {name: t('已取消'), status: '3'},
	  {name: t('全部'), status: ''},
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
				title: t('服务即将开始'),
				icon: 'none'
			});
			return
		}
		uni.showModal({
			title: t('提示'),
			content: t('确定要取消这个预约吗？'),
			confirmText: t('确定'),
			cancelText: t('取消'),
			success: async (res) => {
				if (res.confirm) {
					uni.showLoading({
						title:t('处理中！')
					})
					await orderApi.cancelOrder(record.id, '客户操作取消')
					searchData()
					uni.hideLoading()
					uni.showToast({
						title: t('已取消预约'),
						icon: 'success'
					});
					cookie.updCouponCount()
					cookie.updIntegration()
				}
			}
		});
	}
	//去支付按钮
	const handleToPay = async (record) => {
		if (!record || !record.id) return
		// 付过款又被「仅退款」打回未付款的单：预约还留着等重收，没有下单倒计时，不能当超时单挡掉
		if (record.payTime) {
			payDeadline.value = 0
		} else {
			// 能不能付以服务端 state 为准：这一单是列表里取回来的，按钮只在 state=0 时渲染；
			// 本地倒计时（设备时钟 + 服务器时区推算）归零不代表订单已关闭——
			// 后端关单走 MQ 延迟消息，常比倒计时晚，以前这里一到点就弹「订单已超时取消」，
			// 把还能付的单挡掉了。真关闭了结算接口会明确报错，弹窗内会提示。
			payDeadline.value = payDeadlineMs(record)
		}
		// 先取结算数据再开弹窗，避免弹窗用上一单的价格/券数渲染后被误确认
		if (payModelPageRef.value && payModelPageRef.value.fetchData) {
			try {
				await payModelPageRef.value.fetchData(record.id)
			} catch (e) {
				return
			}
		}
		showPaymentModal.value = true; //支付弹出框弹出
	}
	//加钟模块
	const payDeadline = ref(0)
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
			title: t('处理中'),
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
				title: t('未找到对应的产品！'),
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
				title: t('订单不存在'),
				icon: 'none'
			});
		} else if (orderInfo.value.state == 1 || orderInfo.value.state == 2) {
			uni.showToast({
				title: t('订单已支付'),
				icon: 'none'
			});
		} else if (orderInfo.value.state == 3 || orderInfo.value.state == 4) {
			uni.showToast({
				title: t('订单已取消'),
				icon: 'none'
			});
		} else if (orderInfo.value.state == 5 || orderInfo.value.state == 6) {
			uni.showToast({
				title: t('订单已退款'),
				icon: 'none'
			});
		} else {
			// 加钟单是刚创建的、state 已确认未支付，不再用本地时间二次裁决：
			// 原来那句 Date.parse(createTime) 拿带横杠+空格的串直接解析，iOS 上是 NaN，
			// 判定恒为「已取消」，加钟支付在 iOS 上永远进不去。
			payDeadline.value = payDeadlineMs(orderInfo.value)
			showPaymentModal.value = true; //支付弹出框弹出
			if (payModelPageRef) {
				payModelPageRef.value.fetchData(orderId)
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
				title: t('未支付！'),
				icon:"error"
			});
		} else {
			searchData()
			uni.showToast({
				title: t('支付成功！'),
			});
		}
	}
	const handlePaymentCancel = () => {
		showPaymentModal.value = false;
		//searchData()
		/* uni.showLoading({
			title: t('未完成支付！'),
			mask: true,
		})
		setTimeout(() => {
			uni.hideLoading()
		}, 1000) */
	}

	//评价模块
	const showCommentModal = ref(false)
	const currentCommentRecord = ref(null)
	const refCommentFisrtModel = ref(null)
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
			// 失败时保持弹框打开，允许用户补评分后重新提交
			if (refCommentFisrtModel.value && refCommentFisrtModel.value.cancelSubmitting) {
				refCommentFisrtModel.value.cancelSubmitting()
			}
			uni.showToast({
				title: t('评价提交失败，请重试'),
				icon: 'none'
			})
			return
		}
		searchData()
		hideCommentModal()
		// 成功提示与抽奖入口统一由评价弹框负责
		if (refCommentFisrtModel.value && refCommentFisrtModel.value.confirmSubmitted) {
			refCommentFisrtModel.value.confirmSubmitted(evaluationData.orderId)
		}
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
		
		// 倒计时统一按「服务器时间 + 订单自己的超时窗」从绝对截止时刻算，不再用设备时钟硬减
		applyUnpaidCountdowns(list)
		list.forEach(o => {
			if (o.state == 0) {
				o.cutDownDes = getCutDown(o)
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
		}, t)
		refundReason.value = ''
		refundVisible.value = true
		refundQuoting.value = true
		try {
			const fresh = await previewBrandRefund(row.orderSn)
			if (refundTarget.value === row) refundPreview.value = normalizeRefundQuote(fresh, t)
		} catch (e) {
			if (refundTarget.value === row) {
				refundPreview.value = normalizeRefundQuote({
					paidCents: brandPaidCents(row),
					allowed: false,
					refundQuoteError: brandErrorText(e, t('退款试算暂时不可用，请稍后重试'))
				}, t)
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
				title: preview.blockText || t('当前不可在线退款'),
				icon: 'none'
			})
			return
		}
		refundSubmitting.value = true
		uni.showLoading({
			title: t('正在退款'),
			mask: true
		})
		try {
			const res = await refundBrandCard({
				orderSn: target.orderSn,
				reason: refundReason.value.trim()
			})
			uni.hideLoading()
			refundVisible.value = false
			const lines = [`${t('已退款 ¥')}${brandFormatYuan(Math.round(Number((res && res.refundAmount) || 0) * 100))}${t('，会员权益已终止。')}`]
			if (res && res.warning) lines.push(res.warning)
			if (res && res.customerLocked) {
				lines.push(t('连续两次 7 天内退款，品牌会员购买已暂停；如需再次购买，请联系工作人员解锁。'))
			}
			uni.showModal({
				title: t('退款已提交'),
				content: lines.join('\n'),
				showCancel: false
			})
			searchData()
		} catch (e) {
			uni.hideLoading()
			uni.showToast({
				title: brandErrorText(e, t('退款失败，请稍后重试')),
				icon: 'none'
			})
		} finally {
			refundSubmitting.value = false
		}
	}

	const go_page_brand_member = () => {
		// 未登录不进品牌会员页，入口直接去登录页。
		if (!cookie.getToken()) {
			uni.navigateTo({ url: '/pages/login/login' })
			return
		}
		uni.navigateTo({
			url: '/pages/user/brand-member/brand-member'
		})
	}

	let cutDownTimer = null;
	const startCountdown = () => {
		if (cutDownTimer) clearInterval(cutDownTimer);
		cutDownTimer = setInterval(() => {
			// 每秒从截止时刻重算，而不是把上次的值减 1：
			// setInterval 切后台/锁屏会被限流，靠自减会永久落后于真实时间（回到前台还剩 4 分钟，服务端早关单了）。
			// 同时不再本地改写 state：订单是否关闭只由服务端决定。
			tickUnpaidCountdowns(data.tableData)
			data.tableData.forEach(o => {
				if (o.state == 0) {
					o.cutDownDes = getCutDown(o)
				}
			})
		}, 1000);
	};

	const getCutDown = (item) => {
		const seconds = Math.max(0, Math.floor(Number(item.cutdown) || 0));
		// 倒计时归零不代表订单已关闭：后端关单更慢，这段时间还能付，别显示 00:00:00 让人以为结束了
		if (seconds <= 0) return t('待确认')
		return t('倒计时：') + formatCountdownClock(seconds);
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
					title: t('提示'),
					content: t('确定要取消收藏吗？'),
					confirmText: t('确定'),
					cancelText: t('取消'),
					success: resolve
				})
			})
			if (!res.confirm) return
			await customerMassagistRelationApi.remove(massagist.relationId)
			uni.showToast({
				title: t('已取消收藏'),
				icon: 'none'
			})
			await loadMassagistPreferences()
			return
		}
		const wasBlocked = !!massagist.isBlocked
		await customerMassagistRelationApi.createRelation(massagist.id)
		// 收藏会顺带解除暂别，两条提示合并成一条，避免第二条被小程序吞掉
		uni.showToast({
			title: wasBlocked ? t('已收藏，并解除暂别') : t('收藏成功'),
			icon: wasBlocked ? 'none' : 'success'
		})
		await loadMassagistPreferences()
	}
	const toggleAvoid = async (massagist) => {
		if (!massagist) return
		if (massagist.isBlocked) {
			await customerMassagistBlockApi.remove(massagist.blockId)
			uni.showToast({
				title: t('已恢复，可以正常预约 TA 了'),
				icon: 'none'
			})
			await loadMassagistPreferences()
			return
		}
		const res = await new Promise((resolve) => {
			uni.showModal({
				title: t('暂时不约 TA？'),
				content: `${t('之后预约时会自动避开「')}${massagist.name}${t('」，TA 不会收到任何通知，随时可以恢复。')}`,
				confirmText: t('暂时不约'),
				cancelText: t('再想想'),
				confirmColor: '#7A736B',
				success: resolve
			})
		})
		if (!res.confirm) return
		const wasFavorited = !!massagist.isFavorited
		await customerMassagistBlockApi.createRelation(massagist.id)
		uni.showToast({
			title: wasFavorited ? t('已暂别，并取消收藏') : t('已设为暂别，之后自动避开 TA'),
			icon: 'none'
		})
		await loadMassagistPreferences()
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
			// 头像库里存的是 OSS object key，预览也得先补全域名
			urls: [img(url, 0)]
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
	// name 存中文原文，渲染时用 t() 取词：切语言后已挂载的页面才能跟着变，
	// 若在这里预先 t() 成字符串，页面缓存住的就是挂载时的语言（英文切回中文会卡在英文）。
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
	registerShareHandler(async (res) => {
		if (res?.from !== 'button') return defaultShareMessage()
		console.log(res)
		let shopList = cookie.getStoreList()
		
		shop.value=shopList.filter(t => {
			return t.id == res.target.dataset.shopid
		});
		console.log(shop.value)
		
		let name=cookie.getNickname()
		return {
			title: t('邀请好友共同Full愈'), // 卡片标题
			path: '/pages/index/pay-success/appointment-share?custName='+name+'&orderId='+res.target.dataset.id, // 携带参数
			imageUrl: shareImg(shop.value[0] && shop.value[0].coverImageUrls) || constant.shareCardImage
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