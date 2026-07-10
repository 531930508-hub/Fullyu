<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { useUserStore } from './stores/user'

onLaunch(() => {
  console.log('Full愈 小程序启动')
  // 初始化用户状态
  const userStore = useUserStore()
  userStore.initFromStorage()
})
</script>

<style>
/* Full愈 全局样式 - 基于 Design Token */
page {
  font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background-color: #F5E8D8;
  color: #4B3621;
  font-size: 32rpx;
  line-height: 1.7;
}

/* 安全区适配 */
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

/* 通用容器 */
.container {
  padding: 32rpx;
}

/* 品牌色文字 */
.text-primary {
  color: #6B463C;
}

.text-secondary {
  color: #A08A72;
}

.text-muted {
  color: #7D665C;
}

/* 卡片基础样式 */
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 32rpx;
  box-shadow: 0px 2px 4px rgba(107, 70, 60, 0.08);
  margin-bottom: 24rpx;
}

/* 按钮 */
.btn-primary {
  background: #6B463C;
  color: #FFFFFF;
  border-radius: 16rpx;
  height: 80rpx;
  line-height: 80rpx;
  text-align: center;
  font-size: 32rpx;
  font-weight: 500;
}

.btn-primary:active {
  background: #4A2F28;
}

.btn-secondary {
  background: transparent;
  color: #5A3A32;
  border: 2rpx solid #5A3A32;
  border-radius: 16rpx;
  height: 80rpx;
  line-height: 80rpx;
  text-align: center;
  font-size: 32rpx;
}

.btn-disabled {
  background: #B8A49A;
  color: #FFFFFF;
  border-radius: 16rpx;
  height: 80rpx;
  line-height: 80rpx;
  text-align: center;
  font-size: 32rpx;
}
</style>
