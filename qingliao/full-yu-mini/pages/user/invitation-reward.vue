<template>
  <view class="invitation-container safe-bottom">
    <!-- 顶部背景图片 -->
    <view class="header-bg" :style="{ height: headerHeight + 'px' }">
      <image class="bg-image" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0703/shareBg.jpg" mode="aspectFill"></image>
    </view>

    <!-- 白色卡片内容 -->
    <view class="content-card">
      <text class="title">每推荐一位新用户消费后可得</text>

      <view class="reward-section">
				<image class="reward-number" src="/static/icons/25.png"></image>
        <!-- <text >25</text> -->
        <text class="reward-unit">积分</text>
      </view>

      <text class="description">可在购买卡券时直接抵扣20元</text>
      <text class="sub-description">可叠加使用</text>
    </view>
    <view class="h-24"></view>
    <!-- 底部按钮 -->
    <view class="flex justify-between gap-4 fixed bottom-0 left-0 right-0 py-4 px-5 bg-white border-top safe-bottom">
      <button class="btn btn-modify flex-1" open-type="share">一键分享</button>
      <button class="btn btn-modify flex-1" @click="saveImage">保存图片</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { onShareAppMessage } from '@dcloudio/uni-app'
import cookie from '../../utils/cookieUtil'
import api from '@/api/customer'

// 邀请码
const invitationCode = ref(cookie.getInvitationCode())
const imgUrl = ref('')

// 计算顶部背景高度
const systemInfo = uni.getSystemInfoSync()
const menuButtonInfo = wx.getMenuButtonBoundingClientRect()

const headerHeight = computed(() => {
  const statusBarHeight = systemInfo.statusBarHeight || 0
  const menuButtonHeight = menuButtonInfo.height || 0
  const menuButtonTop = menuButtonInfo.top || 0
  const navigationBarHeight = (menuButtonTop - statusBarHeight) * 2 + menuButtonHeight
  // 852upx 是原始高度，需要转换为 px
  const originalHeightPx = uni.upx2px(852)
  return originalHeightPx + statusBarHeight + navigationBarHeight
})

// 分享配置
onShareAppMessage((res) => {
  return {
    title: '邀请好友共同Full愈',
    path: '/pages/login/login?invitationCode=' + encodeURIComponent(invitationCode.value),
    imageUrl: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0716/share0716.jpg'
  }
})

const getPoster = async () => {
	console.log('invitationCode：'+invitationCode.value)
	const response = await api.generatePosterWithQRCode()
	console.log('邀请海报链接：')
	console.log(response)
	if (response) {
		imgUrl.value = response || ''
	}
}

// 保存图片功能
const saveImage = async () => {
  try {
    uni.showLoading({
      title: '生成中...'
    })

    if (imgUrl.value) {
      // 下载图片到本地
      const downloadResult = await uni.downloadFile({
        url: imgUrl.value
      })

      console.log('下载结果:', downloadResult)

      if (downloadResult.statusCode === 200) {
        // 保存到相册
        await uni.saveImageToPhotosAlbum({
          filePath: downloadResult.tempFilePath,
        })

        uni.showToast({
          title: '保存成功',
          icon: 'success'
        })
      }
    }
  } catch (error) {
    console.error('保存图片失败:', error)
    uni.showToast({
      title: '保存失败',
      icon: 'error'
    })
  } finally {
    uni.hideLoading()
  }
}

onMounted(() => {
  getPoster()
})
</script>

<style lang="less" scoped>
.invitation-container {
  min-height: 100vh;
  position: relative;
}

.header-bg {
  position: relative;
  width: 100%;
	z-index: -1;

  .bg-image {
    width: 100%;
    height: 100%;
  }
}

.btn-modify {
	padding-top: 24rpx;
	padding-bottom: 24rpx;
}
.content-card {
  margin-left: 48rpx;
  margin-right: 48rpx;
	margin-top: -132rpx;
  background: white;
  border-radius: 32rpx;
  padding: 64rpx 48rpx;
  text-align: center;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.1);

  .title {
    font-size: 34rpx;
		font-weight: bold;
    display: block;
  }

  .reward-section {
    display: flex;
    align-items: baseline;
    justify-content: center;
    margin: 64rpx 0;

    .reward-number {
			width: 142rpx;
			height: 94rpx;
    }

    .reward-unit {
      font-size: 36rpx;
      color: #584219;
      margin-left: 10rpx;
    }
  }

  .description {
    font-size: 28rpx;
    color:rgba(0, 0, 0, 0.65);
    margin-bottom: 10rpx;
    display: block;
  }

  .sub-description {
    font-size: 28rpx;
    color: rgba(0, 0, 0, 0.65);
    display: block;
  }
}
</style>
