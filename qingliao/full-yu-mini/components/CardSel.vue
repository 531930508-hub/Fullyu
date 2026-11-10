<template>
  <view class="card-swiper-container">
    <swiper
        class="card-swiper"
        :current="currentIndex"
        :indicator-dots="false"
        :autoplay="false"
        :interval="3000"
        :duration="300"
        :circular="false"
        :previous-margin="swiperMargin + 'px'"
        :next-margin="swiperMargin + 'px'"
        @change="onSwiperChange"
        @animationfinish="onAnimationFinish">
      <swiper-item v-for="(item, index) in displayList" :key="index" class="swiper-item">
        <view class="swiper-item-content" :class="{ 'active': isActiveCard(index) }">
          <image :src="item.url" mode="scaleToFill" class="card-image"></image>
          <view class="card-text">{{ item.text }}</view>
          <view v-if="isActiveCard(index)" class="active-check-icon"></view>
        </view>
      </swiper-item>
    </swiper>
  </view>
</template>

<script setup>
import { ref, computed, watch,defineProps,defineEmits } from 'vue';
import moment from "moment/moment";
const emit = defineEmits(['change']);

const props = defineProps({
  cardList: {
    type: Array,
    default: () => [],
  },
});

watch(() => props.cardList, (newVal) => {
  if (newVal) {
    // 重置表单数据
    initSwiper()
  }
});

const currentIndex = ref(0)
const swiperMargin = ref(40)
const displayList = ref([])

const initSwiper = () => {
  // 计算两侧缩略图的宽度，并转换为 px
  // 假设主图宽度为 240px，两侧缩略图宽度为 200px
  // swiperMargin = (屏幕宽度 - (主图宽度+ 边距)) / 2
  // 为了实现两侧缩略图效果，需要将 swiperMargin 设置为缩略图宽度的一半
  const screenWidth = uni.getSystemInfoSync().windowWidth;
  // 假设中间卡片宽度为 240px，两侧卡片宽度为 200px
  // 240 + 200 + 200 = 640
  // 屏幕宽度 - 640 / 2 = swiperMargin
  // 实际计算应根据设计稿来，这里为了演示效果，直接给一个固定值
  swiperMargin.value = (screenWidth - 300) / 2; // 240 是中间卡片的宽度
  // console.log(this.swiperMargin);

  displayList.value = props.cardList;
  currentIndex.value = 0;
}
const onSwiperChange = (e) => {
  currentIndex.value = e.detail.current;
  console.log('%c[CardSel-onSwiperChange]', 'color: #1678ff', e.detail.current);
  emit('change', {index: e.detail.current});
}
// const onAnimationFinish = (e) => {
//   const { current } = e.detail;
//   const len = props.cardList.length;

//   if (len <= 1) return;

//   // 使用 nextTick 确保在下一个渲染周期执行，避免闪烁
//   if (current === 0) {
//     // 从第一个真实卡片滑动到最后一个复制卡片时，跳转到最后一个真实卡片
//     setTimeout(() => {
//       currentIndex.value = len;
//     }, 0);
//   } else if (current === len + 1) {
//     // 从最后一个真实卡片滑动到第一个复制卡片时，跳转到第一个真实卡片
//     setTimeout(() => {
//       currentIndex.value = 1;
//     }, 0);
//   }
// }

const onAnimationFinish = (e) => {
  // 不再需要处理循环逻辑
}

const isActiveCard = (index) => {
  // 如果只有一个卡片，它始终是激活的
  if (displayList.value.length <= 1) return true;
  
  // 当前显示的卡片索引
  return index === currentIndex.value;
}
console.log(props.cardList)
initSwiper()
</script>

<style lang="scss" scoped>
.card-swiper-container {
  width: 100%;
  height: 300rpx; /* 根据实际卡片高度调整 */
  display: flex;
  justify-content: center;
  align-items: center;
}

.card-swiper {
  width: 100%;
}

.swiper-item {
  display: flex;
  justify-content: center;
  align-items: center;
}

.swiper-item-content {
  width: 400upx;
  height: 226upx;
  border-radius: 16rpx;
  overflow: hidden;
  transition: all 0.3s ease-in-out;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);
  position: relative;
  background-color: #fff;

  &.active {
    width: 480upx;
    height: 270upx;
    border:2upx solid #584219;
  }
}

.active-check-icon {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  border-top: 40rpx solid #584219; /* 绿色背景 */
  border-right: 40rpx solid transparent;
  border-bottom: 40rpx solid transparent;
  border-left: 40rpx solid #584219; /* 绿色背景 */
  border-top-left-radius: 10rpx; /* 与卡片圆角保持一致 */

  &::after {
    content: '';
    width: 36upx;
    height: 36upx;
    background: url('~@/static/icons/check-solid.svg') no-repeat;
    position: absolute;
    top: -26rpx;
    left: -26rpx;
    color: #fff;
  }
}

.card-image {
  width: 100%;
  height: 100%;
  border-radius: 16upx;
}

.card-text {
  position: absolute;
  bottom: 20rpx;
  left: 0;
  width: 100%;
  text-align: center;
  color: #fff;
  font-size: 32rpx;
  text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.5);
}
</style>
