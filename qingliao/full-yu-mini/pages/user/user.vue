<template>
  <view class="user-container safe-bottom">
    <view class="flex justify-center items-center pb-8" :style="{paddingTop: statusBar + 'px', height: customBar + 'px'}">
      <image class="w-[180rpx] h-8 " src="/static/icons/logo.png"/>
    </view>
    <!-- 顶部用户信息 -->
    <view class="user-info relative">
      <image v-if="vipLevel=='大Fu翁'" src="/static/icons/crown.png" class="w-8 h-8 flex-1 absolute" style="top: -24rpx;left:76rpx;z-index: 2"/>
      <image v-else-if="vipLevel=='超级Fu翁'" src="/static/icons/crown.png" class="w-8 h-8 flex-1 absolute" style="top: -24rpx;left:76rpx;z-index: 2"/>
      <image v-else-if="vipLevel=='白金Fu翁'" src="/static/icons/crown.png" class="w-8 h-8 flex-1 absolute" style="top: -24rpx;left:76rpx;z-index: 2"/>
      <image v-else-if="vipLevel=='钻石Fu翁'" src="/static/icons/crown.png" class="w-8 h-8 flex-1 absolute" style="top: -24rpx;left:76rpx;z-index: 2"/>
      <button v-if="!userInfo.token" class="avatar-container" @click="goLogin">
        <image class="avatar" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0703/defaultAvatar.png" mode="aspectFill"></image>
      </button>
      <button v-if="userInfo.token" class="avatar-container" open-type="chooseAvatar" @chooseavatar="chooseAvatar" style="z-index: 1">
        <image class="avatar" :src="userInfo.avatar || 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0703/defaultAvatar.png'" mode="aspectFill"></image>
      </button>
      <view class="user-details" v-if="userInfo.token">
        <view class="username-container">
          <input class="username" v-model="userInfo.nickname" type="nickname" @change="changeNickname" :style="{ width: inputWidth + 'px' }" ref="nicknameInput" :focus="isFocus" @blur="isFocus = false"/>
          <image class="edit-icon" src="/static/icons/edit.png" mode="aspectFit" @click="focusInput"></image>
        </view>
        <view class="points-container">
          <text class="points-label">我的积分：</text>
          <text class="points-value">{{ userInfo.integration || 0 }}</text>
        </view>
      </view>

      <view class="user-details" v-if="!userInfo.token">
        <view class="username-container" @click="goLogin">
          <view>点击登录</view>
        </view>
      </view>
    </view>

		<text class="text-measure text-lg">{{userInfo.nickname}}</text>

    <!-- 功能菜单 -->
    <view class="menu-container">
      <view v-if="!!userInfo.token" class="menu-group" style="margin-top: 48rpx;">
        <view v-for="(item, index) in menuItems1" :key="index" @click="navigateTo(item.path)">
          <view class="menu-item" v-if="item.needAuth ? !!userInfo.token : true"
                :style="{'border-bottom':index+1!= menuItems1.length? '1px solid #0000000F':'none'}">
            <view class="flex flex-1 justify-between">
              <view class="menu-item-left">
                <image class="menu-icon" :src="item.icon" mode="aspectFit"></image>
                <text class="menu-text">{{ item.text }}</text>
              </view>
              <image class="arrow-icon" src="/static/icons/arrow-right-2.png" mode="aspectFit"></image>
            </view>
          </view>
        </view>
      </view>

      <view class="menu-group">
        <view v-for="(item, index) in menuItems2" :key="index">
          <view class="menu-item" v-if="item.needAuth ? !!userInfo.token : true"
                :style="{'border-bottom':index+1!= menuItems2.length? '1px solid #0000000F':'none'}">
            <button class="flex flex-1 justify-between" @click="navigateTo(item.path, item)">
              <view class="menu-item-left">
                <image class="menu-icon" :src="item.icon" mode="aspectFit"></image>
                <text class="menu-text">{{ item.text }}</text>
              </view>
              <image class="arrow-icon" src="/static/icons/arrow-right-2.png" mode="aspectFit"></image>
            </button>
          </view>
        </view>
      </view>

      <view class="logout-btn" v-if="userInfo.token"
              @click="navigateTo('', {icon: '', text: '退出登录', path: '', needAuth: true})">退出登录
      </view>
    </view>
		<CustomTabBar :selected="2" :list="tabBarList" />
	</view>
</template>

<script setup>
import CustomTabBar from '../../components/CustomTabBar.vue';
import {onShareAppMessage, onShareTimeline, onShow, onLoad} from "@dcloudio/uni-app"
import {getCurrentInstance, ref, watch, nextTick} from 'vue'
import {uploadAvatar} from "@/api/upload"
import customerApi from "../../api/customer"
import cookie from "../../utils/cookieUtil"

const {proxy} = getCurrentInstance()
const vm = proxy
const vipLevel = ref(cookie.getVipLevel() || null);

const inputWidth = ref(56)
const nicknameInput = ref(null)
const tabBarList = ref([
	{
		pagePath: '/pages/index/index',
		text: '首页',
		iconPath: '/static/icons/home.png',
		selectedIconPath: '/static/icons/homeHL.png'
	},
	{
		pagePath: '/pages/index/booking',
		text: '预约',
		iconPath: '/static/icons/customer-service.png',
		selectedIconPath: '/static/icons/customer-service.png'
	},
	{
		pagePath: '/pages/user/user',
		text: '我的',
		iconPath: '/static/icons/user.png',
		selectedIconPath: '/static/icons/userHL.png'
	}
]);
const isFocus = ref(false)
const customBar = ref(0)
const statusBar = ref(0)

const focusInput = () => {
  isFocus.value = true
}

onLoad(() => {
  // #ifdef MP-WEIXIN
  const menuButtonInfo = wx.getMenuButtonBoundingClientRect()
  const systemInfo = uni.getSystemInfoSync()
  customBar.value = menuButtonInfo.height + (menuButtonInfo.top - systemInfo.statusBarHeight) * 2
  // customBar.value = menuButtonInfo.botto + menuButtonInfo.top - systemInfo.statusBarHeight
  statusBar.value = systemInfo.statusBarHeight + 27
  // #endif
})

// 用户信息
const userInfo = ref({
  avatar: cookie.getAvatar(),
  nickname: cookie.getNickname(),
  integration: cookie.getIntegration(),
  token: cookie.getToken()
});

onShow(() => {
  updateUser()
  nextTick(() => {
    updateInputWidth()
  })
})

const updateUser = () => {
  userInfo.value = {
    avatar: cookie.getAvatar(),
    nickname: cookie.getNickname(),
    integration: cookie.getIntegration(),
    token: cookie.getToken()
  }
  vipLevel.value = cookie.getVipLevel()
}

const goLogin = () => {
  uni.navigateTo({
    url: '/pages/login/login'
  })
}

// 保存头像到服务器并更新用户信息
const chooseAvatar = async (e) => {
  if (!userInfo.value.token){
    return
  }
  const data = await uploadAvatar(e.detail.avatarUrl)
  const customer = await customerApi.updateAvatar(data)

  cookie.saveAuth(customer)
  updateUser()
  uni.showToast({title: '更新成功', duration: 3000});
}

// 保存并更新用户昵称
const changeNickname = async () => {
  if (userInfo.value.nickname == cookie.getNickname()){
    return
  }
  const customer = await customerApi.updateNickname(userInfo.value.nickname)
  cookie.saveAuth(customer)
  updateUser()
  uni.showToast({title: '更新成功', duration: 3000});
}

watch(() => userInfo.value.nickname, (newValue) => {
  if (newValue) {
    nextTick(() => {
      updateInputWidth();
    });
  }
});

function updateInputWidth() {
  // 获取测量元素的宽度
  uni.createSelectorQuery().in(vm).select('.text-measure').boundingClientRect(rect => {
    if (rect) {
      inputWidth.value = Math.min(160, rect.width + 10);
    }
  }).exec();
}

// 第一组菜单项
const menuItems1 = ref([
  {
    icon: '/static/icons/treatment-record.png',
    text: '服务记录',
    path: '/pages/user/treatment-record',
    needAuth: true,
  },
  {
    icon: '/static/icons/favorite-therapist.png',
    text: '收藏的疗愈师',
    path: '/pages/user/favorite-therapist',
    needAuth: true,
  }
]);

// 第二组菜单项
const menuItems2 = ref([
  {
    icon: '/static/icons/mall.png',
    text: 'Full愈商城',
    path: '/pages/mall/mall',
    needAuth: true,
  },
  {
    icon: '/static/icons/game-reward.png',
    text: '推荐有礼',
    path: '/pages/user/invitation-reward',
    needAuth: true,
  },
	{
	  icon: '/static/icons/redeem-coupons.png',
	  text: '礼品卡兑换',
	  path: '/pages/user/redeem-coupons',
	  needAuth: true,
	},
  {
    icon: '/static/icons/customer-service.png',
    text: '联系客服',
    path: '',
    needAuth: false,
  },
  {
    icon: '/static/icons/about.png',
    text: '关于Full愈',
    path: '/pages/user/about',
    needAuth: false,
  },
  {
    icon: '/static/icons/terms-policy.png',
    text: '条款与政策',
    path: '/pages/user/terms-policy',
    needAuth: false,
  }
]);

// 页面跳转方法
const navigateTo = (path, item) => {
  if (path) {
    uni.navigateTo({
      url: path
    });
  } else {
    if (item && item.text === '退出登录') {
      uni.showModal({
        title: '提示',
        content: '确定要退出登录吗',
        confirmText:"确定",
        success: function (res) {
          if (res.confirm) {
            vm.$Cache.remove('userInfo')
            vm.$Cache.remove('token')
            cookie.clearUser()
            updateUser()
          }
        }
      });
    } else {
      // 联系客服功能
      uni.showModal({
        title: "联系客服",
        cancelText: "取消",
        confirmText: "拨打电话",
        content: "客服电话：19370862828 工作时间：10:00-22:00",
        success(res) {
          if (res.confirm) {
            uni.makePhoneCall({
              phoneNumber: "19370862828"
            })
          }
        }
      })
    }
  }
};


</script>

<style lang="less" scoped>
.text-measure {
  position: absolute;
  top: -9999px;
  left: -9999px;
  visibility: hidden;
  white-space: nowrap;
  font-size: 36upx;
  font-weight: 500;
}

.user-container {
  background: url("https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/backgroundImage.jpg") no-repeat;
  background-size: contain;
  padding: 0 40upx 200upx;

  // 用户信息区域
  .user-info {
    display: flex;
    align-items: center;
    button {
      padding-left: 0!important;
      padding-right: 0!important;
      padding-bottom: 0!important;
      border-radius: 0px !important;
      background-color: transparent!important;
    }
  }

  .avatar-container {
    margin-right: 30upx;
  }

  .avatar {
    width: 128upx;
    height: 128upx;
    border-radius: 50%;
    border:16upx solid #5842191a;
  }

  .user-details {
    flex: 1;
  }

  .username-container {
    display: flex;
    align-items: center;
    margin-bottom: 10upx;
    color: #584219;
  }

  .username {
    font-size: 36upx;
    font-weight: 500;
    color: #333333;
    margin-right: 10upx;
    // max-width: 200upx;
  }

  .edit-icon {
    width: 32upx;
    height: 32upx;
  }

  .points-container {
    display: flex;
    align-items: center;
  }

  .points-label {
    font-size: 24upx;
    color: #666666;
  }

  .points-value {
    font-size: 24upx;
    color: #8A6D3B;
    font-weight: 500;
  }

  // 菜单区域
  .menu-container {
    .menu-group {
      background-color: #ffffff;
      border-radius: 32upx;
      margin-top: 64upx;
      overflow: hidden;
      padding: 0 24upx;
    }

    .menu-item {
      background-color: #fff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 40upx 0 40upx 16rpx;
      border-radius: 0;
      button {
        border: 0;
        padding: 0;
        margin: 0;
        background-color: transparent;

      }
    }

    .menu-item-left {
      display: flex;
      align-items: center;
    }

    .menu-icon {
      width: 40upx;
      height: 40upx;
      margin-right: 20upx;
    }

    .menu-text {
      font-size: 30upx;
      color: #333333;
    }

    .arrow-icon {
      width: 40upx;
      height: 40upx;
    }
  }
  .logout-btn {
    padding: 0;
    margin-top: 64upx;
    color: #584219;
    text-align: center;
  }
}
</style>
