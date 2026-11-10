<template>
	<view class="appointment-page safe-bottom">
		<!-- 预约弹框组件 -->
		<AppointmentModal v-model:visible="showModifyModal" :title="modalTitle" :confirm-text="modalConfirmText"
			:therapist="therapist" :order="order" @confirm="handleModifyConfirm" @cancel="handleModifyCancel" />

		<!-- 支付弹框组件 -->
		<!-- <PaymentModal
      v-model:visible="showPaymentModal"
      :countdown="countdown"
      ref="paymentModalRef"
      @confirm="handlePaymentConfirm"
      @cancel="handlePaymentCancel"/>
	  -->
		<!-- 支付 -->
		<PayModelPage :visible="showPaymentModal" :countdown="countdown" ref="payModelPageRef"
			@confirm="handlePaymentConfirm" @cancel="handlePaymentCancel" />
		<!-- 聊天内容区域 -->
		<scroll-view class="chat-container" scroll-y="true" :scroll-into-view="scrollToViewId">
			<!-- 顶部时间 -->
			<view class="time-header">
				<text class="time-text">{{ currentTime }}</text>
			</view>
			<!-- 欢迎消息 -->
			<view class="message-item left">
				<view class="avatar">
					<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/avatar.jpg"
						class="avatar-img" />
				</view>
				<view class="message-content">
					<view class="message-bubble">
						<view class="message-text">
							{{!!vipLevel ? '尊贵的'+nickname+vipLevel : nickname}}，您好 ！我是智能助手小愈。欢迎来到这里，请问您想预约<text
								v-for="(item,index) in projectList" :key="item"><text
									v-show="index !=0">还是</text>{{ item.title }}</text>？
							方便告诉我预约的时间和前来的人数吗？我将协助您高效完成预约。<br> Hello, {{nickname}}! I'm Xiaoyu, your intelligent
							assistant. Welcome! Are you looking to book
							<text v-for="(item,index) in projectList" :key="item"><text v-show="index !=0"> or </text>a
								{{ item.comment }}</text>?
							Could you please provide the appointment time and the number of people? I'll help you
							complete the booking efficiently.
						</view>
						<view class="quick-actions">
							<text class="text-xs">您也可以选择：</text>
							<button class="action-btn" @click="handleQuickAction">
								<text class="action-text">自主预约Booking</text>
								<image src="/static/icons/arrow-right.png" class="arrow-icon" />
							</button>
						</view>
					</view>
				</view>
			</view>

			<!-- 动态消息列表 -->
			<view class="message-item" v-for="(message, index) in messageList" :key="index"
				:class="{ 'right': message.isSelf, 'left': !message.isSelf }">
				<view class="avatar" v-if="!message.isSelf">
					<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/avatar.jpg"
						class="avatar-img" />
				</view>
				<view class="message-content" v-if="message.loading">
					<view class="message-bubble">
						<view class="loading-indicator">
							<view class="dot"></view>
							<view class="dot"></view>
							<view class="dot"></view>
						</view>
					</view>
				</view>
				<view class="message-content" v-else-if="message.state===0">
					<view class="message-bubble" :class="{ 'user-bubble': message.isSelf }">
						<text class="message-text" v-if="message.messageType === 'text'" user-select>
							{{ message.answer }}
						</text>
						<view class="voice-content" v-else-if="message.messageType === 'voice'"
							:style="{width:(message.voiceDuration > 12 ? 12 :message.voiceDuration) *20+'px'}"
							@click="playVoice(message)">
							<text>{{ message.duration || message.voiceDuration }}''</text>
							<view class="play-wrapper">
								<view v-show="message.play && playMessage.fileUrl == message.fileUrl" class="model">
								</view>
								<image src="/static/icons/voice-play.png" class="play-icon" />
							</view>
						</view>

						<view v-if="!message.isSelf" class="quick-actions">
							<button class="action-btn" @click="handleQuickAction">
								<text class="action-text">自主预约Booking</text>
								<image src="/static/icons/arrow-right.png" class="arrow-icon" />
							</button>
						</view>
					</view>
				</view>

				<!-- 预约确认信息 -->
				<view class="appointment-card" v-if="message.state===1">
					<view class="card-header">
						<text class="card-title">已为您生成订单，请确认</text>
					</view>
					<view class="appointment-details">
						<view class="detail-row">
							<text class="detail-label">到店人数：</text>
							<text class="detail-value">{{ message.personCount|| 0}}</text>
						</view>
						<view class="detail-row">
							<text class="detail-label">放松时长：</text>
							<text class="detail-value">{{message.durationMinutes|| 0}}mins</text>
						</view>
						<view class="detail-row">
							<text class="detail-label">到店时间：</text>
							<text class="detail-value">{{ message.arriveTime }}</text>
						</view>
						<!-- <view class="detail-row">
              <text class="detail-label">疗愈空间：</text>
              <text class="detail-value">{{ message.bedTitle }}区</text>
            </view> -->
					</view>
					<view v-if="message.orderState==1" class="card-actions flex justify-around items-center">
						<button class="btn confirm-btn" style="margin: 0px;"
							@click="confirmAppointment(message.orderId)">
							<text class="btn-text">确定，去支付 </text>
						</button>
						<!-- <button class="btn btn-cancel" @click="modifyAppointment(message.orderId)">
              <text class="btn-text">修改订单</text>
            </button> -->
					</view>
				</view>

			</view>
			<view id="msg-bottom" class="h-4"></view>
		</scroll-view>

		<!-- 底部输入区域 -->
		<view v-if="!isLoading" class="input-area safe-bottom">
			<!-- 语音/键盘切换按钮 -->
			<view class="toggle-btn" @click="toggleInputMode">
				<image :src="inputMode === 'voice' ? keyboardIcon : voiceIcon" mode="aspectFit"></image>
			</view>

			<!-- 文字输入框 -->
			<view class="text-input" v-if="inputMode === 'text'">
				<input type="text" placeholder="请输入消息..." v-model="textContent" @focus="checkLogin"
					@confirm="sendMessage">
			</view>

			<!-- 语音输入按钮 -->
			<view class="voice-input" v-else :class="{ 'recording': recording }" @touchstart="startRecord"
				@touchend="endRecord" @touchmove="handleTouchMove">
				<text>{{ recording ? '松开结束' : '按住说话' }}</text>
				<view class="record-hint" v-if="cancelRecord">
					<text>松开手指取消发送</text>
				</view>
			</view>

			<!-- 发送按钮 -->
			<view class="send-btn" @click="sendMessage" v-if="inputMode === 'text' && textContent.trim()">
				<text>发送</text>
			</view>
		</view>

		<!-- 录音状态指示器 -->
		<view class="record-status" v-if="recording && !cancelRecord">
			<view class="record-indicator"></view>
			<text class="record-time">{{ formatTime(recordingTime) }}</text>
		</view>
	</view>
</template>

<script setup>
	import {
		nextTick,
		onBeforeUnmount,
		onMounted,
		ref
	} from 'vue';
	import moment from 'moment';
	import AppointmentModal from '@/components/AppointmentModal.vue';
	import PayModelPage from '../../components/PayModelPage.vue';
	import cookie from "../../utils/cookieUtil"
	import orderApi from "../../api/order";
	import {
		API_BASE_URL
	} from '../../utils/appConfig.js'
	import constant from '@/consts/constant'
	import customerApi from "../../api/customer"

	const projectList = ref(cookie.getProjectList())

	const countdown = ref(0)

	const nickname = ref(cookie.getNickname() || '微信用户');
	const vipLevel = ref(cookie.getVipLevel() || null);
	// 预约弹框显示状态
	const showModifyModal = ref(false);
	// 支付弹框显示状态
	const showPaymentModal = ref(false);
	// 弹窗标题
	const modalTitle = ref('');
	// 弹窗确认按钮文案
	const modalConfirmText = ref('');

	const paymentModalRef = ref(null)
	const therapist = ref([]);

	// 当前时间
	const currentTime = ref('');

	// 语音录音相关状态
	const recording = ref(false);
	const recordingTime = ref(0);
	const recordInterval = ref(null);
	const touchStartY = ref(0);
	const cancelRecord = ref(false);
	const tempFilePath = ref('');
	const inputMode = ref('text'); // 'text' 或 'voice'
	const textContent = ref('');
	const messageList = ref([]);
	const scrollToViewId = ref('');
	const isLoading = ref(false);
	const orderId = ref('')

	const scrollToBottom = () => {
		scrollToViewId.value = ''
		nextTick(() => {
			scrollToViewId.value = 'msg-bottom';
		});
	};
	const order = ref({})
	const voiceDuration = ref(0)
	const playMessage = ref({})

	// 录音icons路径
	const voiceIcon = '/static/icons/microphone-solid.svg';
	const keyboardIcon = '/static/icons/keyboard-regular.svg';

	// 录音管理器和音频上下文
	const recorderManager = uni.getRecorderManager();
	const innerAudioContext = uni.createInnerAudioContext();

	// 格式化时间
	const formatTime = (seconds) => {
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	};

	// 切换输入模式
	const toggleInputMode = () => {
		if (!checkLogin()) {
			return
		}
		inputMode.value = inputMode.value === 'text' ? 'voice' : 'text';
	};

	// 开始录音
	const startRecord = (e) => {
		touchStartY.value = e.touches[0].clientY;
		cancelRecord.value = false;

		uni.authorize({
			scope: 'scope.record',
			success: () => {
				console.log('录音授权成功');
				const options = {
					format: 'mp3',
					sampleRate: 16000,
					numberOfChannels: 1,
					encodeBitRate: 48000,
					frameSize: 50
				};
				recorderManager.start(options);
			},
			fail: (err) => {
				console.error('录音授权失败', err);
				uni.showModal({
					title: '提示',
					content: '您未授权录音权限，无法使用语音功能。是否前往设置开启？',
					confirmText: "确定",
					success: (res) => {
						if (res.confirm) {
							uni.openSetting();
						}
					}
				});
			}
		});
	};

	// 结束录音
	const endRecord = () => {
		if (recording.value) {
			recorderManager.stop();
		}
	};

	// 处理触摸移动
	const handleTouchMove = (e) => {
		if (!recording.value) return;

		const currentY = e.touches[0].clientY;
		// 判断是否上滑超过50px，如果是则取消发送
		if (touchStartY.value - currentY > 50) {
			cancelRecord.value = true;
		} else {
			cancelRecord.value = false;
		}
	};

	// 播放语音
	const playVoice = (message) => {
		if (message.messageType !== 'voice') return;
		if (message.play) {
			message.play = 0
			innerAudioContext.pause()
			return
		}
		message.play = 1
		playMessage.value = message
		innerAudioContext.src = message.fileUrl
		innerAudioContext.play();
	};

	// 获取当前时间
	const getCurrentTime = () => {
		const now = new Date();
		const hours = now.getHours().toString().padStart(2, '0');
		const minutes = now.getMinutes().toString().padStart(2, '0');
		currentTime.value = `${hours}:${minutes}`;
	};

	// 手动预约操作
	const handleQuickAction = () => {
		/* if (!checkLogin()) {
		  return
		} */
		uni.navigateTo({
			url: '/pages/index/select-project'
		})
		/* showModifyModal.value = true;
		modalTitle.value = '预约疗愈师';
		modalConfirmText.value = '确认';
		order.value = {} */
	};

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
	const payModelPageRef = ref(null)
	// 确认预约
	const confirmAppointment = async (oid) => {
		orderId.value = oid
		orderInfo.value = await orderApi.infoWithDetail(oid)
		if (!order.value) {
			uni.showToast({
				title: '订单不存在',
				icon: 'none'
			});
		} else if (order.value.state == 1 || order.value.state == 2) {
			uni.showToast({
				title: '订单已支付',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else if (order.value.state == 3 || order.value.state == 4) {
			uni.showToast({
				title: '订单已取消',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else if (order.value.state == 5 || order.value.state == 6) {
			uni.showToast({
				title: '订单已退款',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else {
			const createTime = Date.parse(orderInfo.value.createTime) / 1000
			const currentTime = Date.parse(new Date()) / 1000
			countdown.value = constant.payCutDownSeconds - (currentTime - createTime);
			if (countdown.value > 0) {
				showPaymentModal.value = true; //支付弹出框弹出
				if (payModelPageRef) {
					payModelPageRef.value.fetchData(orderId.value)
				}
			} else {
				countdown.value = 0
				uni.showToast({
					title: '订单已取消',
					icon: 'none'
				});
			}
		}
	};

	const closePaymentButton = (oid) => {
		const message = messageList.value.find(s => s.orderId == oid)
		message.orderState = 0
	}

	// 修改订单
	const modifyAppointment = async (oid) => {
		orderId.value = oid
		order.value = await orderApi.infoWithDetail(oid)
		if (!order.value) {
			uni.showToast({
				title: '订单不存在',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else if (order.value.state == 1 || order.value.state == 2) {
			uni.showToast({
				title: '订单已支付',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else if (order.value.state == 3 || order.value.state == 4) {
			uni.showToast({
				title: '订单已取消',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else if (order.value.state == 5 || order.value.state == 6) {
			uni.showToast({
				title: '订单已退款',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else if (order.value.appointmentState == 2) {
			uni.showToast({
				title: '订单已完成',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else if (order.value.appointmentState == 3) {
			uni.showToast({
				title: '订单已取消',
				icon: 'none'
			});
			closePaymentButton(oid)
		} else {
			const createTime = Date.parse(order.value.createTime) / 1000
			const currentTime = Date.parse(new Date()) / 1000
			countdown.value = constant.payCutDownSeconds - (currentTime - createTime);
			if (countdown.value > 0) {
				showModifyModal.value = true;
				modalTitle.value = '修改预约';
				modalConfirmText.value = '确认修改';
				therapist.value = order.value.orderDetailList.map(s => s.massagist.id)
			} else {
				countdown.value = 0
				uni.showToast({
					title: '订单已取消',
					icon: 'none'
				});
				closePaymentButton(oid)
			}
		}
	};

	// 处理修改确认
	const handleModifyConfirm = async (appointmentData) => {
		if (modalTitle.value == '修改预约') {
			await orderApi.updateOrder({
				...appointmentData,
				orderId: orderId.value
			})
			uni.showToast({
				title: '修改成功',
				icon: 'success'
			});
			showModifyModal.value = false;
		} else {
			orderId.value = await orderApi.createOrder({
				...appointmentData,
				appointmentType: 2
			}) || ''
			showModifyModal.value = false;
			confirmAppointment(orderId.value)
		}
	};

	// 处理修改取消
	const handleModifyCancel = () => {
		showModifyModal.value = false;
	};

	// 处理支付确认
	const handlePaymentConfirm = (paymentData) => {
		console.log('支付信息:', paymentData);
		showPaymentModal.value = false;
		cookie.updCouponCount()
		cookie.updIntegration()
		if (paymentData == 'notpay') {
			uni.showToast({
				title: '未支付！',
				icon: "error"
			}, 2000);
			setTimeout(() => {
				uni.switchTab({
					url: '/pages/user/order/order'
				});
			}, 2000)
		} else {
			uni.showToast({
				title: '支付成功！',
			}, 2000);
			setTimeout(() => {
				uni.hideLoading()
				uni.navigateTo({
					url: '/pages/index/pay-success/appointment-success?topdisplayStatus=true&orderId=' +
						paymentData
				});
			}, 2000)
		}
	};

	// 处理支付取消
	const handlePaymentCancel = () => {
		showPaymentModal.value = false;
		countdown.value = 0
	};

	// 监听录音事件
	recorderManager.onStart(() => {
		recording.value = true;
		recordingTime.value = 0;
		recordInterval.value = setInterval(() => {
			recordingTime.value++;
		}, 1000);
	});

	recorderManager.onStop((res) => {
		clearInterval(recordInterval.value);
		recording.value = false;

		if (!cancelRecord.value && res.duration > 1000) {
			// 录音时间大于1秒才保存
			tempFilePath.value = res.tempFilePath;
			const voiceItem = {
				tempFilePath: res.tempFilePath,
				duration: Math.floor(res.duration / 1000)
			};

			// 直接发送语音消息
			// const newMessage = {
			//   messageType: 'voice',
			//   fileUrl: voiceItem.tempFilePath,
			//   duration: voiceItem.duration,
			//   isSelf: true,
			//   state:0,
			//   time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
			// };
			voiceDuration.value = voiceItem.duration || null
			// messageList.value.push(newMessage);
			scrollToBottom();
			sendMessage()
		}

		cancelRecord.value = false;
	});

	recorderManager.onError((err) => {
		console.error('recorder error', err);
		clearInterval(recordInterval.value);
		recording.value = false;
		// uni.showToast({
		//   title: '录音失败',
		//   icon: 'none'
		// });
	});

	// 监听语音播放事件
	innerAudioContext.onEnded(() => {
		console.log('audio play ended');
		playMessage.value.play = 0
	});

	innerAudioContext.onError((err) => {
		console.error('audio play error', err);
		uni.showToast({
			title: '播放失败',
			icon: 'none'
		});
	});

	// 发送消息
	const shop =ref(null)
	function sendMessage() {
		shop.value = cookie.getStore()
		console.log(shop.value)
		const params = {
			message: inputMode.value === 'text' ? textContent.value.trim() : null,
			file: inputMode.value === 'voice' ? tempFilePath.value : null,
			shopId:shop.value.id
		};

		if (inputMode.value === 'text') {
			if (!textContent.value.trim()) return;
			const newMessage = {
				messageType: 'text',
				answer: textContent.value.trim(),
				isSelf: true,
				state: 0,
				time: new Date().toLocaleTimeString([], {
					hour: '2-digit',
					minute: '2-digit'
				})
			};
			messageList.value.push(newMessage);
			textContent.value = '';
			scrollToBottom();
		} else if (inputMode.value === 'voice') {
			const newMessage = {
				messageType: 'voice',
				fileUrl: tempFilePath.value,
				voiceDuration: voiceDuration.value,
				isSelf: true,
				state: 0,
				time: new Date().toLocaleTimeString([], {
					hour: '2-digit',
					minute: '2-digit'
				})
			};
			messageList.value.push(newMessage);
			scrollToBottom();
		}

		messageList.value.push({
			isSelf: false,
			loading: true
		});
		isLoading.value = true;
		scrollToBottom();

		const handleSend = (apiParams) => {
			orderApi.sendMessage(apiParams).then(res => {
				messageList.value.pop();
				isLoading.value = false;
				const replyMessage = {
					messageType: 'text',
					answer: res.answer,
					isSelf: false,
					state: res.state,
					time: new Date().toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit'
					})
				};
				if (res.state == 1) {
					const {
						orderId,
						arriveTime,
						bedTitle,
						projectTitle,
						shopTitle,
						durationMinutes,
						personCount,
						orderState
					} = res;
					replyMessage.orderId = orderId;
					replyMessage.arriveTime = arriveTime;
					replyMessage.projectTitle = projectTitle;
					replyMessage.bedTitle = bedTitle;
					replyMessage.shopTitle = shopTitle;
					replyMessage.durationMinutes = durationMinutes;
					replyMessage.personCount = personCount;
					replyMessage.orderState = orderState;
				}
				messageList.value.push(replyMessage);
				scrollToBottom();
			}).catch(() => {
				messageList.value.pop();
				isLoading.value = false;
				scrollToBottom();
			});
		};

		if (inputMode.value === 'text') {
			handleSend(params);
		} else if (inputMode.value === 'voice') {
			const token = cookie.getToken();
			uni.uploadFile({
				url: API_BASE_URL + '/order/chat/upload',
				filePath: tempFilePath.value,
				name: 'file',
				header: {
					'Authorization': token,
					'fullyMini': 'fullyMini',
				},
				success: (uploadRes) => {
					const {
						data
					} = uploadRes;
					params.fileUrl = JSON.parse(data).data;
					params.voiceDuration = voiceDuration.value || 1;
					handleSend(params);
				},
				fail: () => {
					messageList.value.pop();
					isLoading.value = false;
					scrollToBottom();
				}
			});
		}
	}

	// 获取历史消息
	function getHistoryMessages() {
		orderApi.chatRecord({
			page: 1,
			size: 300,
			createTime: moment().format('YYYY-MM-DD 00:00:00'),
		}).then(res => {
			// console.log(res)
			messageList.value = res.map(v => {
				return {
					...v,
					isSelf: v.userType === 'customer' ? true : false
				}
			})
			scrollToBottom();
		})
	}

	onMounted(() => {
		if (cookie.getToken()) {
			countdown.value = 0
			cookie.updVipLevel()
			cookie.updProjectList()
			getHistoryMessages();
			getCurrentTime();
			// 每分钟更新一次时间
			setInterval(getCurrentTime, 60000);
			setTimeout(() => {
				vipLevel.value = cookie.getVipLevel()
				projectList.value = cookie.getProjectList()
			}, 500)
		}
	});

	onBeforeUnmount(() => {
		// 清除定时器
		clearInterval(recordInterval.value);

		// 销毁录音管理器和音频上下文
		if (recorderManager) {
			recorderManager.stop();
		}

		if (innerAudioContext) {
			innerAudioContext.destroy();
		}
	});
</script>

<style lang="scss" scoped>
	.appointment-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	.time-header {
		text-align: center;
		padding: 20rpx 0;
		background-color: transparent;

		.time-text {
			font-size: 28rpx;
			color: #999;
		}
	}

	.chat-container {
		overflow-y: auto;
		overflow-x: hidden;
		height: calc(100vh - 140rpx);
		box-sizing: border-box;
	}

	.message-item {
		display: flex;
		margin-bottom: 32rpx;

		&.left {
			align-items: flex-end;
			padding-left: 24rpx;

			.avatar {
				margin-right: 24rpx;
				vertical-align: bottom;

				.avatar-img {
					width: 96rpx;
					height: 96rpx;
					border-radius: 50%;
					vertical-align: bottom;
				}
			}
		}

		&.right {
			justify-content: flex-end;
			padding-right: 24rpx;
		}
	}

	.loading-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 40rpx;
	}

	.dot {
		width: 16rpx;
		height: 16rpx;
		margin: 0 8rpx;
		background-color: #a0a0a0;
		border-radius: 50%;
		animation: loading-pulse 1.4s infinite ease-in-out both;
	}

	.dot:nth-child(1) {
		animation-delay: -0.32s;
	}

	.dot:nth-child(2) {
		animation-delay: -0.16s;
	}

	@keyframes loading-pulse {

		0%,
		80%,
		100% {
			transform: scale(0.5);
			opacity: 0.5;
		}

		40% {
			transform: scale(1.0);
			opacity: 1;
		}
	}

	.message-content {
		max-width: 75%;
	}

	.message-bubble {
		background-color: white;
		border-radius: 32rpx 32rpx 32rpx 0;
		padding: 32rpx;
		margin-bottom: 2px;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);

		&.user-bubble {
			border-top-right-radius: 0;
			border-bottom-left-radius: 32rpx;
			background-color: #5842191A;
			color: #584219;
		}

		.message-text {
			font-size: 28upx;
			line-height: 1.5;
		}
	}

	.quick-actions {
		margin-top: 16rpx;
		display: flex;
		align-items: center;
		justify-content: space-between;

		.action-btn {
			margin-right: 0;
			display: flex;
			align-items: center;
			justify-content: space-between;
			background-color: white;
			border: 2rpx solid #584219;
			border-radius: 8rpx;
			padding: 8rpx 16rpx 8rpx 24rpx;

			.action-text {
				font-size: 28rpx;
				color: #584219;
			}

			.arrow-icon {
				width: 24rpx;
				height: 24rpx;
				margin-left: 8upx;
			}
		}
	}

	.appointment-card {
		width: 75%;
		background-color: white;
		border-radius: 24rpx;
		padding: 32rpx;
		box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);

		.card-header {
			margin-bottom: 24rpx;

			.card-title {
				font-size: 32rpx;
				color: #333;
				font-weight: 600;
			}
		}

		.appointment-details {
			margin-bottom: 32rpx;

			.detail-row {
				display: flex;
				align-items: center;
				margin-bottom: 8rpx;

				&:last-child {
					margin-bottom: 0;
				}

				.detail-label {
					font-size: 28rpx;
					color: #00000073;
				}

				.detail-value {
					font-size: 28rpx;
					color: #333;
					font-weight: 500;
				}
			}
		}

		.card-actions {
			display: flex;

			.confirm-btn {
				background-color: #584219;
				margin-left: 0;

				.btn-text {
					color: white;
				}
			}
		}
	}

	.input-area {
		background-color: white;
		padding: 24rpx 32rpx 48rpx;
		border-top: 2rpx solid #e0e0e0;
		display: flex;
		align-items: center;

		.toggle-btn {
			width: 50rpx;
			height: 50rpx;
			margin-right: 20rpx;

			image {
				width: 100%;
				height: 100%;
			}
		}

		.text-input {
			flex: 1;
			height: 70rpx;
			background-color: #f5f5f5;
			border-radius: 40rpx;
			padding: 0 30rpx;

			input {
				width: 100%;
				height: 100%;
			}
		}

		.voice-input {
			flex: 1;
			height: 70rpx;
			background-color: #584219;
			color: white;
			border-radius: 40rpx;
			display: flex;
			justify-content: center;
			align-items: center;
			position: relative;

			&.recording {
				background-color: #E64340;
			}

			.record-hint {
				position: absolute;
				bottom: -60rpx;
				background-color: rgba(0, 0, 0, 0.7);
				color: white;
				padding: 10rpx 20rpx;
				border-radius: 10rpx;
				font-size: 24rpx;
			}
		}

		.send-btn {
			width: 120rpx;
			height: 70rpx;
			background-color: #584219;
			color: white;
			border-radius: 40rpx;
			display: flex;
			justify-content: center;
			align-items: center;
			margin-left: 20rpx;
		}
	}

	.record-status {
		position: fixed;
		bottom: 160rpx;
		left: 50%;
		transform: translateX(-50%);
		background-color: rgba(0, 0, 0, 0.7);
		color: white;
		padding: 20rpx 30rpx;
		border-radius: 20rpx;
		display: flex;
		align-items: center;

		.record-indicator {
			width: 20rpx;
			height: 20rpx;
			background-color: red;
			border-radius: 50%;
			margin-right: 20rpx;
			animation: blink 1s infinite;
		}

		.record-time {
			font-size: 28rpx;
		}
	}

	.voice-content {
		//background-color: white;
		//border-radius: 20rpx;
		//padding: 16rpx 24rpx;
		//box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.1);
		display: flex;
		align-items: center;
		justify-content: flex-end;
		justify-items: right;

		.play-wrapper {
			height: 40rpx;
			width: 42rpx;
			overflow: hidden;
			position: relative;

			.model {
				position: absolute;
				height: 40rpx;
				width: 42rpx;
				background-color: #E6E4E0FF;
				animation: twinkling 1s steps(2, end) infinite;
				z-index: 1;
			}

			.play-icon {
				z-index: 0;
				height: 40rpx;
				width: 42rpx;
			}

			@keyframes twinkling {
				0% {
					right: 12rpx;
				}

				50% {
					right: 34rpx;
				}

				100% {
					right: 46rpx;
				}
			}
		}

		.voice-waves {
			display: flex;
			align-items: flex-end;
			margin-left: 20rpx;

			.wave {
				width: 6rpx;
				margin: 0 2rpx;
				background-color: #584219;
				border-radius: 6rpx;
			}
		}
	}

	.user-bubble {
		background-color: #5842191A;

		.wave {
			background-color: #584219;
		}
	}

	@keyframes blink {
		0% {
			opacity: 1;
		}

		50% {
			opacity: 0.3;
		}

		100% {
			opacity: 1;
		}
	}
</style>