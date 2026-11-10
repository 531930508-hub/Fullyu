<template>
	<!-- 日期选择弹框 -->
	<view class="date-picker-overlay" v-if="visible" @click="handleCancel">
		<view class="date-picker-modal" @click.stop>
			<view class="date-picker-header">
				<text class="date-picker-title">选择日期</text>
				<view class="date-picker-actions">
					<button class="date-picker-cancel" @click="handleCancel">取消</button>
					<button class="date-picker-confirm" @click="handleConfirm">确定</button>
				</view>
			</view>
			<view class="date-picker-content">
				<picker-view :value="pickerValue" @change="onPickerChange" class="picker-view">
					<picker-view-column>
						<view v-for="(month, index) in months" :key="index" class="picker-item">
							{{ month.label }}
						</view>
					</picker-view-column>
					<picker-view-column>
						<view v-for="(day, index) in days" :key="index" class="picker-item">
							{{ day.label }}
						</view>
					</picker-view-column>
				</picker-view>
			</view>
		</view>
	</view>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

// Props
const props = defineProps({
	visible: {
		type: Boolean,
		default: false
	},
	initialDate: {
		type: String,
		default: ''
	}
});

// Emits
const emit = defineEmits(['update:visible', 'confirm', 'cancel']);

// 响应式数据
const pickerValue = ref([0, 0]);

// 获取当前年份和日期
const currentYear = new Date().getFullYear();
const today = new Date();

// 生成月份数据（从当前月份开始的12个月）
const months = computed(() => {
	const monthsArray = [];
	const currentMonth = today.getMonth();
	const maxDate = new Date();
	maxDate.setDate(today.getDate() + 60); // 设置最大可选日期为当前日期后60天
	
	for (let i = 0; i < 12; i++) {
		const month = (currentMonth + i) % 12 + 1;
		const year = currentYear + Math.floor((currentMonth + i) / 12);
		
		// 检查是否超出60天范围
		if (new Date(year, month - 1, 1) <= maxDate) {
			monthsArray.push({
				label: `${year}年${month}月`,
				value: month,
				year: year
			});
		}
	}
	
	return monthsArray;
});

// 生成天数数据（根据选中的月份）
const days = computed(() => {
	const selectedMonth = months.value[pickerValue.value[0]];
	if (!selectedMonth) return [];
	
	const daysInMonth = new Date(selectedMonth.year, selectedMonth.value, 0).getDate();
	const daysArray = [];
	
	// 获取今天的日期，用于过滤过期日期
	const todayDate = today.getDate();
	const todayMonth = today.getMonth() + 1;
	const todayYear = today.getFullYear();

	// 计算最大可选日期
	const maxDate = new Date();
	maxDate.setDate(today.getDate() + 60);

	for (let i = 1; i <= daysInMonth; i++) {
		const currentDate = new Date(selectedMonth.year, selectedMonth.value - 1, i);

		// 检查是否是当天、第二天或第三天
		const isToday = selectedMonth.year === todayYear && selectedMonth.value === todayMonth && i === todayDate;
		const isTomorrow = selectedMonth.year === todayYear && selectedMonth.value === todayMonth && i === todayDate + 1;
		const isDayAfterTomorrow = selectedMonth.year === todayYear && selectedMonth.value === todayMonth && i === todayDate + 2;

		// 检查是否是过期日期或超出60天范围
		const isExpired = currentDate < today;
		const isWithinRange = currentDate <= maxDate;

		if (!isToday && !isTomorrow && !isDayAfterTomorrow && !isExpired && isWithinRange) {
			daysArray.push({
				label: `${i}日`,
				value: i
			});
		}
	}
	
	return daysArray;
});

// 初始化日期选择器
function initDatePicker() {
	// 设置初始值为今天
	const currentMonth = today.getMonth();
	
	// 找到当前月份在months数组中的索引
	const monthIndex = months.value.findIndex(month => 
		month.year === currentYear && month.value === currentMonth + 1
	);

	// 默认选中第一个有效日期
	const dayIndex = 0;
	
	pickerValue.value = [monthIndex >= 0 ? monthIndex : 0, dayIndex];
}

// 日期选择器值变化
function onPickerChange(e) {
	pickerValue.value = e.detail.value;
}

// 确认日期选择
function handleConfirm() {
	const selectedMonth = months.value[pickerValue.value[0]];
	const selectedDay = days.value[pickerValue.value[1]];
	
	if (selectedMonth && selectedDay) {
		const monthStr = selectedMonth.value.toString().padStart(2, '0');
		const dayStr = selectedDay.value.toString().padStart(2, '0');
		
		const fullDate = `${selectedMonth.year}-${monthStr}-${dayStr}`;
		const displayDate = `${monthStr}-${dayStr}`;
		
		emit('confirm', {
			fullDate,
			displayDate
		});
	}
	
	emit('update:visible', false);
}

// 取消选择
function handleCancel() {
	emit('cancel');
	emit('update:visible', false);
}

// 监听visible变化，初始化选择器
watch(() => props.visible, (newVal) => {
	if (newVal) {
		initDatePicker();
	}
});
</script>

<style scoped>
/* 日期选择器弹框样式 */
.date-picker-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0, 0, 0, 0.5);
	z-index: 1000;
	display: flex;
	align-items: flex-end;
	justify-content: center;
}

.date-picker-modal {
	width: 100%;
	background-color: white;
	border-radius: 20rpx 20rpx 0 0;
	padding: 40rpx;
	box-sizing: border-box;
}

.date-picker-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 40rpx;
}

.date-picker-title {
	font-size: 36rpx;
	font-weight: 600;
	color: #333;
}

.date-picker-actions {
	display: flex;
	gap: 20rpx;
}

.date-picker-cancel,
.date-picker-confirm {
	padding: 12rpx 24rpx;
	border-radius: 8rpx;
	font-size: 28rpx;
	border: none;
	cursor: pointer;
}

.date-picker-cancel {
	background-color: #f5f5f5;
	color: #666;
}

.date-picker-confirm {
	background-color: #584219;
	color: white;
}

.date-picker-content {
	height: 400rpx;
}

.picker-view {
	height: 100%;
}

.picker-item {
	height: 80rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 32rpx;
	color: #333;
}
</style>