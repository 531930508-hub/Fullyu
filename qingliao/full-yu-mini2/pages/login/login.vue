<template>
  <view class="login">
    <view class="logo">
      <image src="/static/Logo.png" mode="aspectFit"></image>
    </view>

		<view class="login-form">
			<button class="btn btn-modify wx-login-btn" @click="showAgreedModal" :open-type="isAgreed? 'getPhoneNumber' : ''"  @getphonenumber="onGetPhoneNumber">
				<text>手机号快捷登录</text>
			</button>
			<view class="mt-4" style="text-align: right;">
				<text class="text-[#584219]" @click="go_back()">暂不登录</text>
			</view>
		</view>

    <view class="agreement">
      <checkbox-group @change="onAgreementChange">
        <label>
          <checkbox :checked="isAgreed" color="#584219" />
          <text>我已阅读并同意</text>
          <text class="link"  @click.stop="openAgreement">《用户协议》</text>
          <text>和</text>
          <text class="link" @click.stop="openPrivacy">《隐私政策》</text>
        </label>
      </checkbox-group>
    </view>

    <uni-popup ref="agreedPopup" mode="center">
      <view style="width: 80vw;border-radius: 20rpx;;background: #fff">
        <view class="pt-3">
          <view class="popup-title">请先阅读并同意</view>
          <view class="popup-content">
            <text class="link" @click="openAgreement">《用户协议》</text>
            <text>和</text>
            <text class="link" @click="openPrivacy">《隐私政策》</text>
          </view>
          <view class="btn-con">
            <view class="flex-1">
              <button class="" @click="closePopup">
                <view>拒绝</view>
              </button>
            </view>
            <view class="flex-1" @touchstart="beforeClick">
              <button class="" open-type="getPhoneNumber" @getphonenumber="onGetPhoneNumber">
                <view>同意</view>
              </button>
            </view>
          </view>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
import {onMounted, ref, getCurrentInstance, reactive, toRefs} from 'vue'
import {onLoad} from "@dcloudio/uni-app"
import customerApi from '../../api/customer'
import payUtils from "../../utils/payUtils";
import cookie from "../../utils/cookieUtil"
import UniPopup from "../../uni_modules/uni-popup/components/uni-popup/uni-popup.vue";
import { claimGiftCode, takePendingGift } from "../../api/brandMember";

const {proxy} = getCurrentInstance()
const vm = proxy

const phone = ref(cookie.getPhone())

const wxCode = ref('')
const invitationCode = ref('')

const agreedPopup = ref(null)

// 状态定义
const state = reactive({
  isAgreed: false,
  isLoading: false
});

// 解构状态以便在模板中使用
const { isAgreed, isLoading } = toRefs(state);

onLoad((options) => {
  if (options) {
    const {scene, invitationCode: invitationCodeFromOptions} = options
    if (scene) {
      // scene值为动态小程序码分享的
      invitationCode.value = decodeURIComponent(scene)
    } else if (invitationCodeFromOptions) {
      invitationCode.value = decodeURIComponent(invitationCodeFromOptions)
    }
  } else {
    invitationCode.value = ''
  }
})

const go_back = () => {
	uni.navigateBack(-1)
}

const showPopup = () => {
  console.log(agreedPopup.value);
  agreedPopup.value.open('center')
}

const closePopup = () => {
  agreedPopup.value.close()
}

const submitPopup = () => {
  isAgreed.value = true
  agreedPopup.value.close()
}

const showAgreedModal = () => {
  if (isAgreed.value) {
    return
  }
  showPopup()
}

const beforeClick = () =>{
  submitPopup()
  uni.login({
    provider: 'weixin',
    success: function(loginRes) {
      console.log("loginRes",loginRes);
      wxCode.value = loginRes.code;
    }
  });
}

const onGetPhoneNumber = async (e) => {
  if (e.detail.errMsg === 'getPhoneNumber:ok') {
    if (!e.detail.encryptedData) {
      return uni.showToast({
        title:'获取手机号失败',
        icon:'none'
      })
    }

    let phone = await payUtils.getPhone(e.detail,wxCode.value)
	//手动默认用户
	//phone='15735640028'
    // 发送至后端
    await login(phone)
  } else {
    return uni.showToast({
      title:'用户拒绝授权',
      icon:'error'
    })
  }
}

const login = async (phone) => {
  const activityCode = vm.$Cache.get('activityCode')

  let openId = await payUtils.getOpenId();
  const response = await customerApi.login(phone, openId, invitationCode.value, activityCode)
  const customer = response.customer
  customer.token = response.tokenHead + response.token

  vm.$Cache.put('userInfo', customer)
  vm.$Cache.put('token', response.token)

  cookie.saveAuth(customer)
  cookie.updProjectList()
  vm.$Cache.remove('login')
  vm.$Cache.remove('activityCode')

  // 扫码进入会员页 → 未登录跳到登录 → 登录成功后立即兑换会员码，
  // 返回会员页时 onShow 会重新拉取，直接看到新卡期。
  const pendingGift = takePendingGift()
  if (pendingGift) {
    try {
      const res = await claimGiftCode(pendingGift)
      const days = res && res.days
      uni.showToast({
        title: res && res.replayed ? '这个会员码已兑换过' : days ? `已领取 ${days} 天会员` : '会员码已领取',
        icon: 'none'
      })
    } catch (e) {
      uni.showToast({
        title: (e && (e.msg || e.message)) || '会员码领取失败，请稍后重试',
        icon: 'none'
      })
    }
  }

  const pages = getCurrentPages();  // 获取当前页面栈
  if (pages.length > 1) {
    uni.navigateBack({
      delta: 1,
      animationType: 'pop-out',
      animationDuration: 200
    });
  } else {
    // 跳转到主页
    uni.switchTab({
      url: '/pages/index/index'
    })
  }
}
// 处理协议同意状态变化
const onAgreementChange = (e) => {
  state.isAgreed = e.detail.value.length > 0;
};

// 打开协议页面
const openAgreement = () => {
 uni.showLoading({
 	title: '加载中',
 	mask: true,
 })
 uni.downloadFile({
 	url: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniFile/FullAgreement.pdf',
 	success: function(res) {
 		uni.hideLoading()
 		var filePath = res.tempFilePath;
 		uni.openDocument({
 			filePath: filePath,
 			showMenu: true,
 			success: function(res) {
 				console.log('打开文档成功');
 			}
 		});
 	}
 });
};

// 打开隐私政策页面
const openPrivacy = () => {
  uni.showLoading({
  			title: '加载中',
  			mask: true,
  		})
  		uni.downloadFile({
  			url: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniFile/FullPolicy.pdf',
  			success: function(res) {
  				uni.hideLoading()
  				var filePath = res.tempFilePath;
  				uni.openDocument({
  					filePath: filePath,
  					showMenu: true,
  					success: function(res) {
  						console.log('打开文档成功');
  					}
  				});
  			}
  		});
};

// 生命周期钩子
// onMounted(() => {
//   // 检查是否已登录
//   const token = uni.getStorageSync('token');
//   if (token) {
//     uni.switchTab({
//       url: '/pages/index/index'
//     });
//   }
// });
</script>

<style lang="less" scoped>
.login {
  padding: 80rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100vh;
  box-sizing: border-box;


  .logo {
    margin-bottom: 120rpx;
    text-align: center;
  }

  .logo image {
    width: 160rpx;
    height: 160rpx;
    margin-bottom: 30rpx;
  }

  .app-name {
    font-size: 36rpx;
    font-weight: bold;
    color: #333;
  }

  .login-form {
    width: 100%;
    margin-bottom: 80rpx;
  }

  .wx-login-btn {
    padding: 24upx;
    image {
      width: 40rpx;
      height: 40rpx;
      margin-right: 20rpx;
    }
  }

  .or-line {
    display: flex;
    align-items: center;
    margin-bottom: 40rpx;
  }

  .line {
    flex: 1;
    height: 1rpx;
    background-color: #eee;
  }

  .or-line text {
    padding: 0 20rpx;
    color: #999;
    font-size: 28rpx;
  }

  .phone-login-btn {
    background-color: white;
    color: #584219;
    height: 90rpx;
    line-height: 90rpx;
    border-radius: 45rpx;
    font-size: 32rpx;
    border: 2rpx solid #584219;
  }

  .agreement {
    position: fixed;
    bottom: 60rpx;
    left: 40rpx;
    right: 40rpx;
    font-size: 24rpx;
    color: #999;
    text-align: center;
  }

  .link {
    color: #584219;
    text-decoration: underline;
  }

  .btn-con {
    border-top: 1px solid #0000001a;
    display: flex;flex-direction: row;justify-content: space-between;
    text-align: center;

    view + view {
      border-left: 1px solid #0000001a;
    }
    button {
      font-size: 30rpx;
      font-weight: 600;
      background-color: transparent!important;
      border: 0;
      color: #333;
      padding-top: 30rpx;
      padding-bottom: 30rpx;
    }
  }
  .popup-title {
    font-size: 30rpx;
    font-weight: 600;
    margin: 44rpx 0 32rpx;
    text-align: center;
  }
  .popup-content {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 64rpx;
    text-align: center;
  }
}
</style>
