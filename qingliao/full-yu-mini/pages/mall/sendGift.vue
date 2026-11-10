<template>
  <view class="send-gift min-h-screen bg-gray-100 relative">
    <view class="text-center pt-6 font-bold">
      <text v-if="giftInfo.gift.state == -1">请写下你的祝福语</text>
      <view v-if="giftInfo.gift.state == -1" class="text-xs text-gray-500" style="margin-top: 20rpx">点击卡面可更换</view>
    </view>
    <!-- Main content area -->
    <view class="relative">
      <!-- Blessing message section -->
      <view class="bg-white shadow-md p-2 mx-auto mt-4" style="width: 480rpx;">
        <view class="w-full h-[252rpx] overflow-hidden mb-5" @click="showImgSelect">
          <image :src="cardImg" mode="aspectFill" class="w-full h-full"/>
        </view>
        <view class="text-[30rpx] mb-2 ml-2 pb-8">{{giftTitle}}</view>
        <view v-if="giftInfo.gift.state == -1" class="flex items-center justify-end text-xs " @click="showEditTitle">
          <text class="i-carbon-edit mr-1"></text>
          <text>点击编辑祝福语</text>
        </view>
      </view>

      <!-- Gift section -->
      <view v-for="(detail, detailIdx) in giftInfo.giftDetail" :key="detailIdx" class="mx-5">
        <view class="mt-8 px-1" v-if="detail.useType == 0">
          <view class="text-gray-800 text-base font-semibold mb-4">礼物：{{ detail.name }}</view>
          <view class="bg-white rounded-lg shadow-sm p-3 flex items-center">
            <image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Full%E6%84%88%E5%88%B8.jpg" class="w-[240rpx] h-20 rounded-md mr-4" />
            <view class="flex-1">
              <view class="text-[34rpx] font-bold mb-2">{{ detail.size }}张</view>
              <view class="text-xs text-gray-500 mb-1">有效期至：{{ detail.endDate && detail.endDate.startsWith('2') ? detail.endDate: '永久有效'}}</view>
              <view class="text-xs text-gray-500">可享受：共 {{ detail.size * 15 }} mins Full愈 时长</view>
            </view>
          </view>
        </view>

        <!-- Gift 2 section -->
        <view class="mt-8" v-if="detail.useType == 1">
          <view class="flex items-center mb-2">
            <view class="text-gray-800 text-base font-semibold">礼物2：{{ detail.name }}</view>
            <button class="coupon-badge">Full愈</button>
          </view>
          <view class="bg-white rounded-lg shadow-sm p-4 text-sm text-gray-600 leading-relaxed">
            {{detail.comment}}
          </view>
        </view>
      </view>
    </view>

    <view class="h-24"></view>
    <!-- Bottom fixed payment button -->
    <view class="fixed bottom-0 left-0 w-full bg-white p-4 shadow-lg z-50" @click="sendGift">
      <button open-type="share" class="w-full bg-[#584219] text-white py-3 rounded-lg text-sm">赠送微信好友</button>
    </view>

    <uni-popup ref="titleInputPopup" mode="center">
      <view style="width: 80vw;border-radius: 20rpx;background: #fff">
        <view class="pt-3">
          <view class="cover-sel-title">请填写祝福语</view>

          <view class="cover-sel-sub-title" style="margin: 0 25rpx;text-align: left">
              <input v-model="inputTitleVal"
                     type="text"
                     placeholder="请输入祝福语"
                     style="border: 1px solid #E5E5E5;height: 70rpx;padding: 0 20rpx;font-size: 28rpx;"/>
          </view>

          <view class="btn-con">
            <view class="flex-1" @click="closePopup">取消</view>
            <view class="flex-1" @click="submitTitle" >确定</view>
          </view>
        </view>
      </view>
    </uni-popup>

    <uni-popup ref="giftCoverPopup" mode="center">
      <view style="width: 90vw;background: #fff;border-radius: 20rpx" class="pt-3">
        <view class="cover-sel-title">选择卡面</view>
        <view class="cover-sel-sub-title">左右滑动选择卡券图案</view>

        <view>
          <CardSel :card-list="coverList" @change="onCardChange"></CardSel>
        </view>
        <view class="btn-con">
          <view class="flex-1" @click="onCoverCancel">取消</view>
          <view class="flex-1" @click="onCoverSel">选择</view>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
import {onLoad, onShareAppMessage, onShow} from "@dcloudio/uni-app"
import {ref} from 'vue'
import giveGiftApi from "../../api/giveGift";
import UniPopup from "../../uni_modules/uni-popup/components/uni-popup/uni-popup.vue";
import CardSel from "../../components/CardSel.vue";
import MiniImageApi from "../../api/miniImage";

const giftId = ref(-1)
const giftInfo = ref({
  gift: {},
  order: {},
  giftDetail: [],
})

const giftTitle = ref('特别的感谢，给特别的你')
// 输入标题
const inputTitleVal = ref('')
// 分享码
const shareCode = ref('')
// 卡面
const coverList = ref([])
const curSelIndex = ref(0)
const cardImg = ref('')
const defaultImg = ref('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/%E5%88%86%E4%BA%AB%E7%A4%BC%E5%93%81%E5%8D%A1%203.jpg')

// refs
const titleInputPopup = ref(null)
const giftCoverPopup = ref(null)

onLoad((options) => {
  console.log(options.id)
  giftId.value = options.id

  fetchData()
})
onShareAppMessage((res) => {
  console.log('%c[sendGift-]', 'color: #1678ff', )

  return {
    title: giftTitle.value, // 卡片标题
    path: `/pages/mall/gift?id=${giftId.value}&shareCode=${encodeURIComponent(shareCode.value)}`, // 携带参数
    imageUrl: cardImg.value // 1:1 比例缩略图
  }
})

const fetchGift = async () => {
  let data = await giveGiftApi.infoById(giftId.value)
  giftInfo.value = data || {
    gift: {},
    order: {},
    giftDetail: [],
  }
  cardImg.value = data.gift.image ? data.gift.image : defaultImg.value
  giftTitle.value = data.gift.title ? data.gift.title : '特别的感谢，给特别的你'
}
const fetchShareCode = async () => {
  let code = await giveGiftApi.getShareCode(giftId.value)
  shareCode.value = code
}
const fetchCardCover = async () => {
  let imgList = await MiniImageApi.couponImageList()
  console.log('%c[sendGift-fetchCardCover]', 'color: #1678ff', imgList)
  coverList.value = imgList || []
  if (imgList.length) {
    if (cardImg.value || cardImg.value === '') {
      cardImg.value = imgList[0].url
    }
  } else {
    if (cardImg.value || cardImg.value === '') {
      cardImg.value = defaultImg.value
    }
  }
}
const fetchData = async () => {
  fetchGift()
  fetchShareCode()
  fetchCardCover()
}

const showEditTitle = () => {
  inputTitleVal.value = giftTitle.value || ''
  titleInputPopup.value.open('center')
}

const closePopup = () => {
  titleInputPopup.value.close()
}

const submitTitle = () => {
  if (inputTitleVal.value && inputTitleVal.value.trim()) {
    giftTitle.value = inputTitleVal.value
  }
  titleInputPopup.value.close()
}

const showImgSelect = () => {
  if (giftInfo.value.gift.state !== -1) {
    return
  }
  // 默认选择第一个
  cardImg.value = coverList.value[0].url
  giftCoverPopup.value.open('center')
}

const onCardChange = ({index}) => {
  console.log('%c[sendGift-onCardChange]', 'color: #1678ff', index)
  curSelIndex.value = index
}

const onCoverCancel = () => {
  giftCoverPopup.value.close()
}
const onCoverSel = () => {
  giftCoverPopup.value.close()
  let card = coverList.value[curSelIndex.value]
  console.log('%c[sendGift-onCoverSel]', 'color: #1678ff', card.url)
  cardImg.value = card.url
}

const sendGift = async () => {
  let form = giftInfo.value.gift
  form.title = giftTitle.value
  form.image = cardImg.value
  if (giftInfo.value.gift.state <= 0) {
    await giveGiftApi.sendGift(form)
    await fetchShareCode()
  }
  console.log('%c[sendGift-sendGift]', 'color: #1678ff', shareCode.value)
}

</script>

<style lang="less" scoped>
.send-gift {
  background: url('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/backgroundImage.jpg') no-repeat;
  background-size: 100% 786rpx;


}
.coupon-badge {
  background: linear-gradient(305.24deg, #737E90 -14.09%, #D0D6E3 58.6%);
  color: #666;
  padding: 4upx 12upx;
  border-radius: 8upx;
  font-size: 20upx;
  margin-right: 0;

  &.gold {
    background: linear-gradient(297.18deg, #A18341 30.28%, #EEDBA6 78.78%);
    color: #584219;
  }
}


.btn-con {
  border-top: 1px solid #0000001a;
  display: flex;flex-direction: row;justify-content: space-between;
  margin-top: 64rpx;
  text-align: center;

  view + view {
    border-left: 1px solid #0000001a;
  }
  view {
    font-size: 30rpx;
    font-weight: 600;
    background-color: transparent!important;
    border: 0;
    color: #333;
    padding-top: 30rpx;
    padding-bottom: 30rpx;
  }
}

.cover-sel-title {
  font-size: 30rpx;
  font-weight: 600;
  margin: 44rpx 0 32rpx;
  text-align: center;
}
.cover-sel-sub-title {
  font-size: 28rpx;
  color: #666;
  text-align: center;
}
</style>
