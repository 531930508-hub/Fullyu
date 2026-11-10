<template>
  <div class="sidebar-inner">
    <sidebar-logo :collapsed="isCollapse"></sidebar-logo>
    <scroll-bar class="sidebar-scroll">
      <el-menu
        mode="vertical"
        :show-timeout="120"
        :hide-timeout="120"
        :default-active="$route.path"
        :collapse="isCollapse"
        :collapse-transition="false"
        background-color="transparent"
        text-color="#FFFFFFA8"
        active-text-color="#FFFFFF"
      >
        <sidebar-item :routes="routes"></sidebar-item>
      </el-menu>
    </scroll-bar>
    <div class="sidebar-foot" v-if="!isCollapse">
      <span class="sidebar-foot__dot"></span>
      <span>Full愈 · 让疗愈更轻盈</span>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import SidebarItem from './SidebarItem'
import SidebarLogo from './Logo'
import ScrollBar from '@/components/ScrollBar'

export default {
  components: { SidebarItem, SidebarLogo, ScrollBar },
  computed: {
    ...mapGetters([
      'sidebar',
      'routers'
    ]),
    routes() {
      return this.routers
    },
    isCollapse() {
      return !this.sidebar.opened
    }
  }
}
</script>

<style lang="scss" scoped>
@import "src/styles/variables.scss";

.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sidebar-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 14px 24px 18px;
  color: rgba(255, 255, 255, .3);
  font-size: 10.5px;
  letter-spacing: .04em;
  white-space: nowrap;

  &__dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(203, 187, 247, .55);
  }
}
</style>