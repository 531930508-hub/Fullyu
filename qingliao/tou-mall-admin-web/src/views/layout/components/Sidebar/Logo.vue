<template>
  <router-link to="/home" class="sidebar-logo" :class="{ 'is-collapsed': collapsed }" aria-label="Full愈 轻疗运营台 - 返回首页">
    <img v-if="collapsed" class="sidebar-logo__mark" src="@/assets/images/brand/logo-mark-light.png" alt="Full愈">
    <template v-else>
      <img class="sidebar-logo__word" src="@/assets/images/brand/logo-wordmark-light.png" alt="Full愈">
      <span class="sidebar-logo__sub">轻疗 · 运营管理台</span>
    </template>
  </router-link>
</template>

<script>
export default {
  name: 'SidebarLogo',
  props: {
    collapsed: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style lang="scss" scoped>
@import "src/styles/variables.scss";

// 真实品牌 wordmark（Fūll愈），深色侧栏使用米白变体；收起态仅保留「愈」字标
.sidebar-logo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  height: 64px;
  margin: 0 12px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, .06);
  box-sizing: border-box;
  overflow: hidden;

  &__word {
    display: block;
    height: 27px;
    width: auto;
    opacity: .96;
  }

  &__mark {
    display: block;
    height: 30px;
    width: auto;
    opacity: .96;
  }

  &__sub {
    color: rgba(255, 255, 255, .4);
    font-size: 10.5px;
    letter-spacing: .14em;
    white-space: nowrap;
    line-height: 1;
  }

  &.is-collapsed {
    align-items: center;
    padding: 0;
    margin: 0 10px;
  }
}
</style>