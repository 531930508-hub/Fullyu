<template>
  <view class="lottery-bg" :style="{ backgroundImage: `url(${lotteryBg})` }">
    <view class="container">
      <!-- 标题 -->
      <view class="title-section">
        <image :src="leafImage" class="leaf-img"></image>
        <image :src="titleImage" class="title-img"></image>
      </view>

      <!-- 九宫格 -->
      <view class="grid-container">
        <view class="grid">
          <view v-for="(item, index) in gridItems" :key="index" class="grid-item-wrapper">
            <view v-if="item.type === 'prize'" class="grid-item"
                  :class="{ 'selected': selected === item.prize.index }"
                  :style="{ backgroundImage: `url(${selected === item.prize.index ? gridBgDark :  gridBgLight})` }">
              <image :src="selected === item.prize.index ? item.prize.image_h : item.prize.image" class="prize-img" :data-label="item.prize.label"></image>
            </view>
            <view v-else-if="item.type === 'button'" class="grid-item button" @click="startDraw">
              <image :src="drawButtonImage" class="draw-btn-img"></image>
            </view>
          </view>
        </view>
      </view>

      <!-- 描述信息 -->
      <view class="points-info">
        <image :src="pointsInfoImage" class="points-info-img"></image>
      </view>
    </view>

  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from "@dcloudio/uni-app"
import integrationApi from "../../api/integration"
import cookie from "../../utils/cookieUtil"

// 图片资源
const lotteryBg = ref('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/choujiang.png')
const leafImage = ref('/static/icons/lottery/leaf.png')
const titleImage = ref('/static/icons/lottery/lottery-title.png')
const gridBgDark = ref('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0701/grid-bg-dark.png')
const gridBgLight = ref('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0701/grid-bg-light.png')
const drawButtonImage = ref('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0701/draw-button.png')
const pointsInfoImage = ref('/static/icons/lottery/points-info.png')

const prizes = ref([
  { index: 0, label: '6', value: 6, image: '/static/icons/lottery/prize-6.png', image_h: '/static/icons/lottery/prize-6-highlight.png' },
  { index: 1, label: 'thank', value: 0, image: '/static/icons/lottery/thank-you.png', image_h: '/static/icons/lottery/thank-you-highlight.png' },
  { index: 2, label: '3', value: 3, image: '/static/icons/lottery/prize-3.png', image_h: '/static/icons/lottery/prize-3-highlight.png' },
  { index: 3, label: '6', value: 6, image: '/static/icons/lottery/prize-6.png', image_h: '/static/icons/lottery/prize-6-highlight.png' },
  { index: 4, label: '10', value: 10, image: '/static/icons/lottery/prize-10.png', image_h: '/static/icons/lottery/prize-10-highlight.png' },
  { index: 5, label: 'thank', value: 0, image: '/static/icons/lottery/thank-you.png', image_h: '/static/icons/lottery/thank-you-highlight.png' },
  { index: 6, label: '1', value: 1, image: '/static/icons/lottery/prize-1.png', image_h: '/static/icons/lottery/prize-1-highlight.png' },
  { index: 7, label: '3', value: 3, image: '/static/icons/lottery/prize-3.png', image_h: '/static/icons/lottery/prize-3-highlight.png' },
])

const gridMapping = [0, 1, 2, 7, -1, 3, 6, 5, 4] // -1 for button

const gridItems = computed(() => {
  return gridMapping.map(prizeIndex => {
    if (prizeIndex === -1) {
      return { type: 'button' }
    }
    return { type: 'prize', prize: prizes.value.find(p => p.index === prizeIndex) }
  })
})

const rotating = ref(false)
const selected = ref(-1)
const winPrize = ref('')
const winPrizeDetails = ref(null)
const orderId = ref(0)
const loading = ref(false)
const lastDrawTime = ref(0)
const DRAW_COOLDOWN = 3000 // 3秒冷却时间

onLoad((options) => {
  if (options.orderId) {
    orderId.value = options.orderId
  }
})

async function startDraw() {
  const now = Date.now()
  if (rotating.value || loading.value) {
    uni.showToast({ title: '请等待当前抽奖完成', icon: 'none', duration: 1500 })
    return
  }
  if (now - lastDrawTime.value < DRAW_COOLDOWN) {
    const remainingTime = Math.ceil((DRAW_COOLDOWN - (now - lastDrawTime.value)) / 1000)
    uni.showToast({ title: `请等待${remainingTime}秒后再试`, icon: 'none', duration: 1500 })
    return
  }
  lastDrawTime.value = now
  loading.value = true

  // 先调用接口获取抽奖结果
  try {
    winPrize.value = await integrationApi.prizeDraw(orderId.value) || 'thank'
  } catch (error) {
    console.error('抽奖API调用失败:', error)
    winPrize.value = 'thank'
    uni.showToast({ title: error, icon: 'none', duration: 3000 })
    loading.value = false
    return
  }

  loading.value = false

  // 根据接口返回结果确定中奖奖品
  let matchingPrizes = prizes.value.filter(p => p.label == winPrize.value)
  if (matchingPrizes.length === 0) {
    matchingPrizes = prizes.value.filter(p => p.label === 'thank');
  }
  const selectedPrize = matchingPrizes[Math.floor(Math.random() * matchingPrizes.length)]
  winPrizeDetails.value = selectedPrize

  // 接口调用完成后再开始九宫格转动动画
  rotating.value = true
  startAnimation(selectedPrize);
}

function startAnimation(selectedPrize) {
    let currentIndex = 0
    const baseSteps = 16
    const totalSteps = baseSteps + selectedPrize.index
    let stepCount = 0

    const getAnimationSpeed = (step, total) => {
        const progress = step / total;
        if (progress < 0.3) return Math.max(100, 300 - (progress * 600)); // 初始速度放慢
        else if (progress < 0.7) return 100; // 中间匀速阶段放慢
        else {
            const slowProgress = (progress - 0.7) / 0.3;
            return 100 + (slowProgress * 400); // 减速阶段更平滑
        }
    };

    const runAnimation = () => {
        selected.value = prizes.value[currentIndex].index
        currentIndex = (currentIndex + 1) % prizes.value.length
        stepCount++

      if (stepCount > totalSteps) {
            selected.value = selectedPrize.index
            rotating.value = false
            setTimeout(() => {
                if (winPrizeDetails.value && winPrizeDetails.value.value > 0) {
                    uni.showModal({
                        title: `获得${winPrizeDetails.value.value}积分`,
                        content: '积分可在购买Full愈券时抵扣',
                        confirmText: '我知道了',
                        cancelText: '去购券',
                        success: (res) => {
                            if (res.confirm) {
                                uni.switchTab({
                                   url: '/pages/user/user'
                                })
                            } else if (res.cancel) {
                              uni.navigateTo({
                                url: '/pages/mall/mall'
                              })
                            }
                        }
                    })
                    cookie.updIntegration()
                } else {
                    uni.showModal({
                        title: '谢谢惠顾',
                        content: '很遗憾，这次没有中奖，下次再来试试吧！',
                        showCancel: false,
                        confirmText: '我知道了',
                        success: (res) => {
                            if (res.confirm) {
                                uni.switchTab({
                                    url: '/pages/user/user'
                                })
                            }
                        }
                    })
                }
            }, 800)
        } else {
            const nextSpeed = getAnimationSpeed(stepCount, totalSteps)
            setTimeout(runAnimation, nextSpeed)
        }
    }
    runAnimation()
}



</script>

<style lang="scss" scoped>
.lottery-bg {
  width: 100vw;
  height: 100vh;
  background-size: cover;
  background-position: top center;
  background-repeat: no-repeat;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
}

.container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 180rpx;
}

.title-section {
  margin-bottom: 60rpx;
  .leaf-img {
    position: absolute;
    width: 300rpx;
    height: 180rpx;
    left: 0;
  }
  .title-img {
    width: 270rpx;
    height: 48rpx;
    margin-top: 90rpx;
  }
}

.grid-container {
  margin-top: 40rpx;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 16rpx;
  width: 680rpx;
  height: 680rpx;
}

.grid-item-wrapper {
  width: 100%;
  height: 100%;
}

.grid-item {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  border-radius: 20rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s ease;
  &.selected {
    transform: scale(1.05);
  }
  .prize-img {
    width: 120rpx;
    height: 40rpx;
  }

  .prize-img[data-label='thank'] {
    width: 160rpx;
    height: 70rpx;
  }
}

.button {
  background-color: transparent;
  .draw-btn-img {
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
}

.points-info {
  margin-top: 80rpx;
  .points-info-img {
    width: 336rpx;
    height: 74rpx;
  }
}


</style>
