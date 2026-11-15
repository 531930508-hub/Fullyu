<template>
  <router-link to="/home" class="sidebar-logo" :class="{ 'is-collapsed': collapsed }" aria-label="Full愈 轻疗疗愈空间 运营管理台 - 返回首页">
    <img v-if="collapsed" class="sidebar-logo__mark" src="@/assets/images/brand/logo-mark-light.svg" alt="Full愈">
    <template v-else>
      <img class="sidebar-logo__word" src="@/assets/images/brand/logo-full-light.svg" alt="Full愈 轻疗疗愈空间">
      <span class="sidebar-logo__sub">运营管理台</span>
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
// 品牌素材统一使用 src/assets/images/brand 下的 SVG（浅色/深色两套），收起态仅保留品牌符号
.sidebar-logo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 7px;
  height: 64px;
  margin: 0 12px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, .06);
  box-sizing: border-box;
  overflow: hidden;

  &__word {
    display: block;
    height: 28px;
    width: auto;
  }

  &__mark {
    display: block;
    height: 28px;
    width: auto;
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