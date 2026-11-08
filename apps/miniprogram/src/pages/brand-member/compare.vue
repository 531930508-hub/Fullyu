<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/brand-member/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <view class="nav-copy">
        <text class="nav-title serif">{{ tr('两张卡的区别', 'Two cards, explained') }}</text>
        <text class="nav-sub">{{ tr('Full愈年卡 · 在场畅练卡', 'Full Yu Annual · Presence Pass') }}</text>
      </view>
    </view>

    <view class="content">
      <view class="lead">
        <text class="lead-title serif">{{ tr('不是二选一的替代关系', 'They are not substitutes') }}</text>
        <text class="lead-desc">
          {{ tr('在场畅练卡解决「有效期内免费上课」，Full愈年卡解决「三个品牌通用的会员价、积分和游戏」。两张卡可以同时持有，各算各的权益。', 'The Presence Pass covers free classes during its term. The Full Yu Annual card adds cross-brand member prices, shared points and the Journey game. You can hold both; each keeps its own benefits.') }}
        </text>
      </view>

      <view class="cards">
        <view class="mini brand">
          <text class="mini-eyebrow latin">FULL YU ANNUAL</text>
          <text class="mini-name serif">{{ tr('Full愈年卡', 'Full Yu Annual') }}</text>
          <text class="mini-price">¥299 {{ tr('/ 年', '/ year') }} · ¥45 {{ tr('/ 月', '/ month') }}</text>
          <text class="mini-role">{{ tr('品牌通用 · 三店权益', 'Brand-wide · all three stores') }}</text>
        </view>
        <view class="mini pass">
          <text class="mini-eyebrow latin">PRESENCE PASS</text>
          <text class="mini-name serif">{{ tr('在场畅练卡', 'Presence Pass') }}</text>
          <text class="mini-price">{{ tr('以在场卡种页为准', 'See Presence plans') }}</text>
          <text class="mini-role">{{ tr('在场本店 · 有效期内免费上课', 'Presence only · free classes') }}</text>
        </view>
      </view>

      <view class="compare">
        <view class="compare-row head">
          <text class="cell label">{{ tr('对比项', 'Item') }}</text>
          <text class="cell">{{ tr('Full愈年卡', 'Full Yu Annual') }}</text>
          <text class="cell">{{ tr('在场畅练卡', 'Presence Pass') }}</text>
        </view>
        <view v-for="row in rows" :key="row.label" class="compare-row">
          <text class="cell label">{{ row.label }}</text>
          <text class="cell">{{ row.brand }}</text>
          <text class="cell">{{ row.pass }}</text>
        </view>
      </view>

      <view class="flow-card">
        <text class="flow-title serif">{{ tr('上课计价顺序', 'Class price order') }}</text>
        <view class="flow">
          <view class="flow-step active">
            <text class="flow-num">1</text>
            <view class="flow-copy">
              <text class="flow-name">{{ tr('畅练卡有效', 'Pass active') }}</text>
              <text class="flow-desc">{{ tr('课程免费，不再扣品牌权益', 'Class free; no brand benefit used') }}</text>
            </view>
          </view>
          <view class="flow-step">
            <text class="flow-num">2</text>
            <view class="flow-copy">
              <text class="flow-name">{{ tr('没有畅练卡或已过期', 'No pass or expired') }}</text>
              <text class="flow-desc">{{ tr('按 Full愈年卡会员价', 'Full Yu Annual member price') }}</text>
            </view>
          </view>
          <view class="flow-step">
            <text class="flow-num">3</text>
            <view class="flow-copy">
              <text class="flow-name">{{ tr('两张卡都没有', 'Neither card') }}</text>
              <text class="flow-desc">{{ tr('按课程原价', 'List price') }}</text>
            </view>
          </view>
        </view>
        <text class="flow-note">{{ tr('系统按顺序取第一个可用价格，不叠加优惠。', 'The first available price applies; discounts do not stack.') }}</text>
      </view>

      <view class="actions">
        <button class="btn primary" @tap="goBrand">{{ tr('查看 / 开通 Full愈年卡', 'View or join Full Yu Annual') }}</button>
        <button class="btn secondary" @tap="goPass">{{ tr('查看 / 续费在场畅练卡', 'View or renew Presence Pass') }}</button>
      </view>

      <view class="fine-card">
        <text class="fine">{{ tr('两张卡分别由不同系统管理：品牌年卡由 Full愈 CRM 统一记账，畅练卡由在场系统管理。任一系统维护时，另一张卡的权益不受影响。', 'The cards live in separate systems: Full Yu Annual is recorded in Full Yu CRM, while the Presence Pass is managed by Presence. Maintenance in one system does not affect the other card.') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FloatingBack from '@/components/FloatingBack.vue'
import { readCapsuleLayout } from '@/utils/capsule'
import { tr } from '@/locale'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop

const rows = computed(() => [
  {
    label: tr('归属', 'Managed by'),
    brand: tr('Full愈品牌 · CRM 统一管理', 'Full Yu brand · CRM'),
    pass: tr('在场 · 本店系统管理', 'Presence · local system')
  },
  {
    label: tr('适用范围', 'Coverage'),
    brand: tr('时叙、在场、轻疗三店', 'Teahour, Presence, Retreat'),
    pass: tr('在场课程', 'Presence classes')
  },
  {
    label: tr('核心权益', 'Core benefit'),
    brand: tr('三店会员价、通用积分、愈行之旅', 'Member prices, points, Journey game'),
    pass: tr('有效期内课程免费、优先预约', 'Free classes, priority booking')
  },
  {
    label: tr('是否含免费课', 'Free classes'),
    brand: tr('不含', 'No'),
    pass: tr('含，按卡种与有效期', 'Yes, per plan and term')
  },
  {
    label: tr('积分怎么用', 'Points use'),
    brand: tr('通用积分；在场本期只展示，暂不抵扣', 'Shared points; display only at Presence for now'),
    pass: tr('不产生品牌积分规则', 'No brand points rule')
  },
  {
    label: tr('购买与续费', 'Buy / renew'),
    brand: tr('品牌会员页，本店收款', 'Brand member page, paid here'),
    pass: tr('在场畅练卡页，按在场规则', 'Presence Pass page')
  }
])

function goBrand() {
  const pages = getCurrentPages()
  if (pages && pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.redirectTo({ url: '/pages/brand-member/index' })
}
function goPass() {
  uni.switchTab({ url: '/pages/member/index' })
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); font-size: 28rpx; }
.nav-bar { padding: 20rpx 32rpx; display: flex; align-items: center; gap: 16rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-copy { flex: 1; min-width: 0; }
.nav-title { display: block; font-size: 36rpx; line-height: 1.4; }
.nav-sub { display: block; font-size: 20rpx; letter-spacing: 1rpx; color: var(--c-muted); }
.content { padding: 8rpx 32rpx 0; }
button::after { border: none; }

.lead { padding: 32rpx 30rpx; border-radius: 30rpx; background: var(--c-card); border: 1rpx solid var(--line-soft); }
.lead-title { display: block; font-size: 34rpx; line-height: 1.4; }
.lead-desc { display: block; margin-top: 12rpx; font-size: 23rpx; line-height: 1.8; color: var(--c-muted); }

.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; margin-top: 20rpx; }
.mini { padding: 24rpx 22rpx; border-radius: 24rpx; border: 1rpx solid var(--line-soft); }
.mini.brand { background: #f6f0e5; border-color: #e2d4bb; }
.mini.pass { background: #f2f5ea; border-color: #dbe3c8; }
.mini-eyebrow { display: block; font-size: 16rpx; letter-spacing: 3rpx; color: var(--c-brown); }
.mini-name { display: block; margin-top: 8rpx; font-size: 30rpx; line-height: 1.35; }
.mini-price { display: block; margin-top: 10rpx; font-size: 20rpx; color: var(--c-primary); }
.mini-role { display: block; margin-top: 6rpx; font-size: 19rpx; line-height: 1.6; color: var(--c-muted); }

.compare { margin-top: 20rpx; border-radius: 28rpx; overflow: hidden; border: 1rpx solid var(--line-soft); background: var(--c-card); }
.compare-row { display: grid; grid-template-columns: 1.05fr 1.5fr 1.45fr; border-bottom: 1rpx solid var(--line-soft); }
.compare-row:last-child { border-bottom: 0; }
.compare-row.head { background: var(--c-card-2); }
.cell { padding: 16rpx 14rpx; font-size: 20rpx; line-height: 1.6; }
.cell.label { color: var(--c-muted); background: rgba(243, 239, 224, .45); }
.compare-row.head .cell { font-weight: 600; font-size: 19rpx; color: var(--c-primary); }
.compare-row.head .cell.label { color: var(--c-muted); }

.flow-card { margin-top: 20rpx; padding: 30rpx 28rpx; border-radius: 28rpx; background: var(--c-card); border: 1rpx solid var(--line-soft); }
.flow-title { display: block; font-size: 30rpx; }
.flow { margin-top: 18rpx; }
.flow-step { display: flex; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx dashed var(--line-soft); }
.flow-step:last-child { border-bottom: 0; }
.flow-num { flex: none; width: 44rpx; height: 44rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20rpx; background: var(--c-card-2); color: var(--c-primary); }
.flow-step.active .flow-num { background: #6d7f52; color: #f6f8ef; }
.flow-copy { flex: 1; min-width: 0; }
.flow-name { display: block; font-size: 24rpx; }
.flow-desc { display: block; margin-top: 2rpx; font-size: 20rpx; color: var(--c-muted); }
.flow-note { display: block; margin-top: 16rpx; font-size: 20rpx; line-height: 1.6; color: var(--c-muted); }

.actions { display: flex; flex-direction: column; gap: 14rpx; margin-top: 24rpx; }
.btn { min-height: 88rpx; padding: 0 32rpx; border-radius: 999rpx; font-size: 27rpx; display: flex; align-items: center; justify-content: center; line-height: 1.4; }
.btn.primary { background: var(--c-primary); border: 1rpx solid var(--c-primary); color: var(--c-rice); }
.btn.secondary { background: var(--c-card); border: 1rpx solid var(--c-primary); color: var(--c-primary); }
.fine-card { margin-top: 20rpx; padding: 24rpx 26rpx; border-radius: 22rpx; background: var(--c-card-2); }
.fine { display: block; font-size: 20rpx; line-height: 1.75; color: var(--c-muted); }
</style>
