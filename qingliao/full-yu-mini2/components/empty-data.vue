<template>
<view class="empty-container">
  <image class="empty-image" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/empty.png" :style="{width: width, height: height}"/>
  <view class="empty-content">
    <text class="empty-title">{{ title }}</text>
    <text v-if="desc" class="empty-desc">{{ desc }}</text>
		<slot></slot>
  </view> 
</view>
</template>

<script setup>
import { defineProps } from 'vue';

const props = defineProps({
  width: {
    type: String,
    default: '340rpx',
  },
  height: {
    type: String,
    default: '340rpx',
  },
  title: {
    type: String,
    default: '暂无内容',
  },
  desc: {
    type: String,
    default: '',
  },
});


</script>

<style lang="less" scoped>
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60rpx 40rpx;
  min-height: 400rpx;
  text-align: center;
}

.empty-image {
  display: block;
  margin-bottom: 32rpx;
  object-fit: contain;
  min-width: 200rpx;
  min-height: 200rpx;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.empty-title {
  font-size: 28rpx;
  color: #999999;
  font-weight: 500;
  line-height: 1.4;
}

.empty-desc {
  font-size: 28rpx;
  color: #cccccc;
  line-height: 1.5;
  margin-top: 8rpx;
}
</style>