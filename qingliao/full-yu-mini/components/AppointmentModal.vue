<template>
	<!-- 预约弹框 -->
	<view class="modal-overlay" v-if="visible" @click="handleCancel">
		<view class="appointment-modal" @click.stop>
			<view class="modal-header">
        <view class="modal-title flex" @click="openSelectModal">
          <view style="padding-top: 4rpx">
            <image v-if="therapist==null" class="mr-1" src="/static/icons/map-marker-alt-solid.svg"
                   style="width: 26rpx; height: 26rpx"/>
          </view>
          <view class="title-img">{{ shop.name }}</view>
          <view class="title-img">
            <image v-if="therapist==null" class="mr-1" src="/static/icons/address-down.svg"
                   style="width: 26rpx; height: 26rpx;margin-left: 10rpx"/>
          </view>
        </view>
        <view v-if="(!order.id || order.state == 0) && multiple" class="form-label" @click.stop>
          <text>多人同行</text>
          <text class="label-note">(Book Together)</text>
          <switch :checked="multipleGuests" @change="onMultipleGuestsChange" color="#584219" style="transform:scale(0.7)"/>
        </view>
        <view v-if="!multiple && therapist" class="therapist-info">
          <image class="therapist-avatar" :src="therapist.avatarUrl || '/static/icons/avatar-placeholder.svg'"
                 mode="aspectFill"></image>
          <view class="therapist-details">
            <text class="therapist-name">{{ therapist.name }}</text>
          </view>
        </view>
			</view>

			<view class="modal-content">
				<!-- 人数选择 -->
				<view class="form-item mb-4" v-if="multipleGuests && (!order.id || order.state == 0)">
					<view class="flex items-center justify-between">
						<view class="form-label mb-0">
							<text>同行人数</text>
							<text class="label-note">(Number of Guests)</text>
						</view>
						<view class="guest-count-selector flex items-center">
							<button class="count-btn" @click="decreasePersonCount()" :disabled="personCount <= 1">-</button>
							<text class="count-display mx-2">{{ personCount }}</text>
							<button class="count-btn" @click="increasePersonCount()" :disabled="personCount == maxPersonCount">+</button>
						</view>
					</view>
				</view>

				<!-- 项目类型 -->
				<view class="form-item" v-if="!order.id || order.state == 0">
					<view class="form-label">
						<text>项目类型</text>
						<text class="label-note">(Treatment Type)</text>
					</view>
					<view class="treatment-types">
						<view v-for="(item,index) in projectList" :key="index" class="treatment-type"
                  :class="{ active: productId === item.id }" @click="selectTreatment(item.id,item.type)">
                <text class="treatment-name">{{ item.title }}</text>
                <text class="treatment-name-en">{{ item.comment }}</text>
						</view>
					</view>
				</view>
				<!-- 放松时长 -->
				<view class="form-item" v-if="!order.id || order.state == 0">
					<view class="form-label">
						<text>放松时长</text>
						<text class="label-note">(Duration)</text>
					</view>
          <view v-if="order.duration == 15" class="duration-options">
						<view v-for="duration in durations" :key="duration" class="duration-option"
                  :class="{ active: selectedDuration === duration }" @click="selectDuration(duration)">
							<text>{{ duration || 0}}mins</text>
						</view>
					</view>
          <view v-else class="duration-options">
            <view v-for="duration in durations.filter(s=> s != 15)" :key="duration" class="duration-option"
                  :class="{ active: selectedDuration === duration }" @click="selectDuration(duration)">
              <text>{{ duration || 0}}mins</text>
            </view>
          </view>
					<!-- 描述文字 -->
					<view class="duration-description" v-if="durationDescription">
						<text>{{ durationDescription }}</text>
					</view>
				</view>

				<!-- 到店日期 -->
				<view class="form-item">
					<view class="form-label">
						<text>到店日期</text>
						<text class="label-note">(Date)</text>
					</view>
					<view class="date-options">
						<view
							v-for="date in dates"
							:key="date.value"
							class="date-option"
							:class="{ active: selectedDate === date.value }"
							@click="selectDate(date.value)">
              <text class="date-name">{{ date.label }}</text>
              <text v-if="date.englishLabel" class="date-name-en">{{ date.englishLabel }}</text>
						</view>
					</view>
				</view>

				<!-- 到店时间 -->
				<view class="form-item">
					<view class="form-label">
						<text>到店时间</text>
						<text class="label-note">(Time)</text>
					</view>
					<view class="time-grid" :class="{ loading: isLoading }">
						<view v-if="isLoading" class="loading-container">
							<view class="loading-spinner"></view>
						</view>
						<template v-else>
							<view
								v-for="time in times"
								:key="time.time"
								class="time-option"
								:class="{ active: selectedTime === time.time, disabled: time.state === 0 }"
								@click="selectTime(time)">
								<text>{{ time.time }}</text>
							</view>
						</template>
					</view>
				</view>
			</view>

			<view class="modal-footer sticky bottom-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-[env(safe-area-inset-bottom)]">
				<button class="cancel-btn" @click="handleCancel">取消</button>
				<button class="confirm-btn" :class="{'disabled': isLoading || !selectedTime}" @click="handleConfirm" :disabled="isLoading || !selectedTime">{{ confirmText }}</button>
			</view>
		</view>
	</view>
</template>

<script setup>
import {computed, onMounted, ref, watch, getCurrentInstance} from 'vue';
import {onShow} from "@dcloudio/uni-app"
import moment from 'moment';
import api from '@/api/order.js'
import cookie from "../utils/cookieUtil";
import shopApi from "../api/shop";
import debounce from "../utils/debounce";

const {proxy} = getCurrentInstance()
const vm = proxy

// Props
const props = defineProps({
	visible: {
		type: Boolean,
		default: false
	},
	title: {
		type: String,
		default: '预约'
	},
	confirmText: {
		type: String,
		default: '确定'
	},
  therapistList: {
    type:Array,
    default: () => []
  },
  order: {
    type:Object,
    default: () => ({})
  },
  multiple: {
	  type: Boolean,
    default: true
  }
});

const projectList = ref(cookie.getProjectList)

//最多同行数
const maxPersonCount = ref(99)
//门店id
const shop = ref({})
const shopList = ref(cookie.getStoreList())
//门店id
const therapist = ref(null)

// Emits
const emit = defineEmits(['update:visible', 'confirm', 'cancel']);

// 表单数据
const multipleGuests = ref(false);
const personCount = ref(1); // 同行人数
const productId = ref(1);
const productType = ref(1)
const selectedDuration = ref(15);
const selectedDate = ref(moment().format('YYYY-MM-DD')); // 默认选中当天
const selectedTime = ref(null);

// 选项数据
const durations = ref([15, 45, 60, 90]);

const dates = ref([
  {label: "今天", value: moment().format('YYYY-MM-DD'), englishLabel: "Today"},
  {label: "明天", value: moment().add(1, 'days').format('YYYY-MM-DD'), englishLabel: "Tmmr"},
  {label: moment().add(2, 'days').format('MM-DD'), value: moment().add(2, 'days').format('YYYY-MM-DD')},
  {label: moment().add(3, 'days').format('MM-DD'), value: moment().add(3, 'days').format('YYYY-MM-DD')},
]);
const times = ref([]);
const isLoading = ref(false);

const findBookingDates = () => {
  return api.findBookingDates(shop.value.id).then(res => {
    if (res && res.length) {
      dates.value = res
      if(!selectedDate.value){
        selectedDate.value = res[0].value
        selectedTime.value = null
      }
    }
  })
}

// 计算描述文字
const durationDescription = computed(() => {
  if (!selectedDuration.value) return '';

  if (productType.value === 1) {
    switch (selectedDuration.value) {
      case 15:
        return '高效焕新，快速缓解疲劳';
      case 45:
        return '轻松醒脑，含洗发和基础舒筋手法，放松头皮，促进血液循环';
      case 60:
        return '深度放松，含洗发、手法舒筋和水循环护理，解压舒心';
      case 90:
        return '沉浸愈疗，含洗发、手法舒筋、水循环和眉心滴油，全方位放松';
      default:
        return '';
    }
  } else if (productType.value === 2) {
    switch (selectedDuration.value) {
      case 30:
        return '舒颈/醒脑/明目/焕颜/活手 可任选单项';
      case 60:
        return '舒颈/醒脑/明目/焕颜/活手 可任选两项';
      case 90:
        return '舒颈/醒脑/明目/焕颜/活手 可任选三项';
      default:
        return '';
    }
  }

  return '';
});

function getTimeList() {
	if (!selectedDate.value || !selectedDuration.value || !productId.value) {
		times.value = [];
		return;
	}

	isLoading.value = true;
	times.value = []; // 清空旧数据
	const product = projectList.value.find(s => s.id == productId.value);

	debounce(async () => {
		try {
			const res = await api.timeList({
				date: selectedDate.value,
				personCount: multipleGuests.value ? personCount.value : 1,
				projectId: product.projectId,
				durationMinutes: selectedDuration.value,
        massagistId:therapist.value ? therapist.value.id : null,
        shopId:shop.value ? shop.value.id : 1
			});
			times.value = res || [];
		} catch (err) {
			selectedDate.value = null;
			selectedTime.value = null;
			times.value = [];
      selectedDate.value = null;
			console.error('请求错误:', err);
		} finally {
			isLoading.value = false;
		}
	}, 800);
}

function getStoreList(){
  shopList.value = cookie.getStoreList() || []
  if (props.order && props.order.id) {
    cookie.setStore(shopList.value.find(s=>s.id == props.order.shopId))
  }
  const store = cookie.getStore() || []
  if (store.id){
    shop.value = store
  }
}

// 多人同行切换
function onMultipleGuestsChange(e) {
	multipleGuests.value = e.detail.value;
	if (!multipleGuests.value) {
		personCount.value = 1; // 如果关闭多人同行，重置人数为1
	}
}

// 新增：减少人数
function decreasePersonCount() {
	if (personCount.value > 1) {
		personCount.value--;
	}
}

// 新增：增加人数
function increasePersonCount() {
	personCount.value++;
}

// 选择项目类型
function selectTreatment(id,type) {
  const day = new Date().getDay()
  productId.value = id;
  const prevSelectedDuration = selectedDuration.value; // 保存当前选中的时长
	durations.value = []
	selectedDuration.value = ''
  productType.value = type
  if (productType.value==2) {
    durations.value = [30, 60, 90]
    // 检查之前选中的时长是否在新列表中，如果存在则保留，否则设置为默认值30
    if (durations.value.includes(prevSelectedDuration)) {
      selectedDuration.value = prevSelectedDuration;
    } else {
      selectedDuration.value = 30;
    }
  } else {
    durations.value = [15, 45, 60, 90]
    // 检查之前选中的时长是否在新列表中，如果存在则保留，否则设置为默认值15
    if (durations.value.includes(prevSelectedDuration)) {
      selectedDuration.value = prevSelectedDuration;
    } else {
      selectedDuration.value = 45;
    }
  }
	selectedTime.value = ''
  getTimeList(); // 更新时间选项列表
  getMaxBedCount()
}

// 选择放松时长
function selectDuration(duration) {
	selectedDuration.value = duration;
	selectedTime.value = ''
	getTimeList(); // 更新时间选项列表
}

// 选择到店日期
function selectDate(date) {
  selectedDate.value = date; // 更新显示的选中日期
	selectedTime.value = null; // 清空已选时间
	getTimeList(); // 更新时间选项列表
}

// 选择时间
function selectTime(time) {
	if (time.state === 1) {
		selectedTime.value = time.time;
	}
}

// 处理取消
function handleCancel() {
	emit('update:visible', false);
	emit('cancel');
}

// 处理确认
function handleConfirm() {
  if (!productId.value){
    uni.showToast({
      title: '请选择项目类型',
      icon: 'none'
    });
      return
  }
  const durationMinutes = selectedDuration.value
  if (!durationMinutes){
    uni.showToast({
      title: '请选择放松时长',
      icon: 'none'
    });
    return;
  }
  const date = selectedDate.value
  if (!date){
    uni.showToast({
      title: '请选择到店日期',
      icon: 'none'
    });
    return;
  }
  const time =  selectedTime.value
  if (!time){
    uni.showToast({
      title: '请选择到店时间',
      icon: 'none'
    });
    return;
  }
	const formData = {
    personCount: multipleGuests.value ? personCount.value : 1, // 更新：在表单数据中添加人数
    productId: productId.value,
    durationMinutes: durationMinutes,
    startTime: date + ' '+ time + ":00",
    shopId:shop.value ? shop.value.id : 1
    // massagistIdList: props.therapist || []
	};
  emit('confirm', formData);
	emit('update:visible', false);
}

async function getMaxBedCount(){
  maxPersonCount.value = await shopApi.maxBedCount(shop.value.id,productType.value)
}

function openSelectModal() {
  if (therapist.value!=null){
    return
  }
  const itemList = shopList.value.map(item => {
    if (item.id == shop.value.id){
      return item.name + '（当前选择）'
    }
    return item.name
  })

  uni.showActionSheet({
    itemList: itemList,
    success: async (res) => {
      const selectedItem = shopList.value[res.tapIndex]
      shop.value = selectedItem
      cookie.setStore(selectedItem)
      getMaxBedCount()
      await findBookingDates()
      getTimeList()
    }
  })
}

// 监听visible变化，重置表单
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    getStoreList()
    cookie.updProjectList()
    await findBookingDates()
    if (!props.multiple){
      therapist.value = vm.$Cache.get('therapist')
    } else {
      vm.$Cache.remove('therapist')
    }
    // 重置表单数据
    projectList.value = cookie.getProjectList()
    //是否含有订单,用于修改回写数据
    if (props.order && props.order.id) {
      personCount.value = props.order.orderDetailList ? props.order.orderDetailList.length : 1 ; // 更新：重置人数
      multipleGuests.value = personCount.value > 1;
      selectedDuration.value = props.order.duration;
      if (projectList.value && projectList.value.length) {
        const product = projectList.value.find(s=> s.id == props.order.productId)
        productId.value = product.id || 1;
        selectTreatment(product.id,product.type)
      }
      selectedDate.value = moment(props.order.startTime).format('YYYY-MM-DD');
      selectedTime.value = moment(props.order.startTime).format('HH:mm');
    } else {
      multipleGuests.value = false;
      personCount.value = 1; // 更新：重置人数
      selectedDuration.value = 45;
      selectedDate.value = moment().format('YYYY-MM-DD');
      selectedTime.value = null;
      if (projectList.value && projectList.value.length) {
        selectTreatment(projectList.value[0].id,projectList.value[0].type)
      }
    }
  }
});

watch(() => maxPersonCount.value, (newVal) => {
  if (newVal) {
    if (personCount.value > maxPersonCount.value){
      personCount.value = maxPersonCount.value
    }
    if (!multipleGuests.value){
      return
    }
    if (personCount.value == maxPersonCount.value){
      uni.showToast({
        title: `最多同行${maxPersonCount.value}人`,
        icon: 'none'
      });
    }
  }
});

watch(() => personCount.value, (newVal) => {
  if (newVal) {
    if (personCount.value > maxPersonCount.value){
      personCount.value = maxPersonCount.value
    }
    if (!multipleGuests.value){
      return
    }
    if (personCount.value == maxPersonCount.value){
      uni.showToast({
        title: `最多同行${maxPersonCount.value}人`,
        icon: 'none'
      });
    }
    getTimeList(); // 更新时间选项列表
  }
});
</script>

<style lang="less" scoped>
// 弹框样式
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}

.appointment-modal {
  background-color: #ffffff;
  border-radius: 32upx 32upx 0 0;
  width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  // box-sizing: border-box;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 48upx;
  padding: 32upx 24upx 32upx 48upx;
  border-bottom: 1px solid #0000001A;

  .modal-title {
    font-size: 28upx;
    font-weight: bold;
    color: #333333;

    .title-img {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }
}

.form-label {
  display: flex;
  align-items: center;

  text:first-child {
    font-size: 26upx;
    color: #000000E0;
    margin-right: 16upx;
  }

  .label-note {
    font-size: 24upx;
    color: #000000A6;
  }
}

.modal-content {
  padding-left: 48upx;
  padding-right: 48upx;
}

// 新增：人数选择器样式
.person-count-selector {
  display: flex;
  align-items: center;
  gap: 16upx;
  margin-top: 16upx;
  margin-bottom: 32upx;

  .count-btn {
    width: 60upx;
    height: 60upx;
    line-height: 60upx;
    text-align: center;
    border: 2upx solid #0000001A;
    border-radius: 8upx;
    background-color: #fff;
    color: #333;
    font-size: 32upx;
    padding: 0;

    &[disabled] {
      background-color: #f0f0f0;
      color: #ccc;
      border-color: #e0e0e0;
    }
  }

  .count-display {
    font-size: 28upx;
    color: #333;
    min-width: 40upx;
    text-align: center;
  }
}

// 项目类型样式
.treatment-types {
  margin-top: 16upx;
  display: flex;
  gap: 24upx;

  .treatment-type {
    flex: 1;
    border-radius: 8upx;
    padding: 10upx 0;
    border: 2upx solid #0000001A;
    transition: all 0.3s;
    margin-bottom: 32upx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80upx;
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
        color:#584219;
      }
    }

    .treatment-name {
      font-size: 28upx;
      font-weight: 500;
      color: #333333;
    }

    .treatment-name-en {
      font-size: 20upx;
      color: #666666;
      display: block;
    }
  }
}

// 放松时长样式
.duration-options {
  display: flex;
  gap: 16rpx;
  margin-top: 16upx;
  margin-bottom: 16upx;

  .duration-option {
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
        color:#584219;
      }
    }

    text {
      font-size: 28upx;
      color: #333333;
    }
  }
}

// 描述文字样式
.duration-description {
  margin-top: 16upx;
  margin-bottom: 32upx;

  text {
    font-size: 24upx;
    color: #d2956e;
    line-height: 1.4;
  }
}


// 日期选项样式
.date-options {
  display: flex;
  gap: 16rpx;
  margin-bottom: 22upx;
  margin-top: 16upx;
  padding-bottom: 10upx;
  overflow-x: auto;

  .date-option {
    flex: 0 0 auto;
    border-radius: 8upx;
    padding: 8rpx 26rpx;
    border: 2upx solid #0000001A;
    transition: all 0.3s;
    display: flex;
    //flex-direction: column;
    align-items: center;
    justify-content: center;
    //min-height: 80upx;
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

      .date-name,
      .date-name-en {
        color:#584219;
      }
    }

    .date-name {
      font-size: 28upx;
      font-weight: 500;
      color: #333333;
    }

    .date-name-en {
      font-size: 24upx;
      color: #333333;
      //display: block;
    }
  }
}

// 时间网格样式
.time-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16upx;
  margin-top: 32upx;
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
        color:#00000040;
      }
    }

    text {
      font-size: 28upx;
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

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

// 底部按钮样式
.modal-footer {
  display: flex;
  gap: 24upx;
  padding: 32upx 48upx;
  background-color: #fff;
  border-top: 1px solid #0000001A;

  .cancel-btn,
  .confirm-btn {
    flex: 1;
    border-radius:16upx;
    padding: 24upx 16upx;
    font-size: 28upx;
    font-weight: 500;
    border: 2upx solid #584219;
  }

  .cancel-btn {
    background-color: #fff;
    color: #584219;
  }

  .confirm-btn {
    background-color: #584219;
    color: #ffffff;
  }

  .confirm-btn.disabled {
    background-color: rgba(88, 66, 25, 0.6);
    color: #ffffff;
    border-color: transparent;
  }
}



.therapist-info {
  display: flex;
  margin-right: 24upx;

  .therapist-avatar {
    width: 48upx;
    height: 48upx;
    border-radius: 50%;
    margin-right: 32upx;
    border: 2upx solid #0000001A;
  }

  .therapist-name {
    font-size: 34upx;
    color: #333333;
    margin-bottom: 8upx;
  }
}
</style>
