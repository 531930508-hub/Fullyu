<template>
  <div class="tabbed-page">
    <div class="tabbed-page__bar" v-if="visibleTabs.length">
      <el-tabs v-model="active" @tab-click="syncQuery">
        <el-tab-pane
          v-for="tab in visibleTabs"
          :key="tab.name"
          :name="tab.name"
          :label="tab.label"/>
      </el-tabs>
    </div>
    <div class="tabbed-page__body">
      <keep-alive v-if="currentComponent">
        <component :is="currentComponent"/>
      </keep-alive>
      <div v-else class="tabbed-page__empty">
        <span class="tabbed-page__empty-mark">愈</span>
        <p>当前角色未分配此页面的任何页签权限</p>
        <span>请联系管理员在「账号权限 · 角色权限 · 分配菜单」中勾选页签</span>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * 同类页面合并入口：一个菜单项 = 一组 tab。
 * - 子页面通过 ?tab=xxx 深链，旧地址跳转时带上 tab 参数即可落到对应页签
 * - keep-alive 保留各页签的表单/筛选状态，来回切换不重新加载
 * - 页签级权限：tab.perm 对应 ums_menu 中「页面name:页签name」的隐藏菜单行，
 *   角色分配菜单时可勾到页签；超级管理员与未迁移页签行的旧菜单表保持全量
 */
const SUPER_ADMIN_ROLE = '超级管理员'

export default {
  name: 'TabbedPage',
  props: {
    tabs: {
      type: Array,
      required: true
    },
    defaultTab: {
      type: String,
      default: ''
    }
  },
  data() {
    const names = this.tabs.map(tab => tab.name)
    const fromQuery = (this.$route && this.$route.query && this.$route.query.tab) || ''
    return {
      active: names.indexOf(fromQuery) > -1 ? fromQuery : (this.defaultTab || names[0] || '')
    }
  },
  computed: {
    visibleTabs() {
      const menus = this.$store.getters.menus || []
      const roles = this.$store.getters.roles || []
      if (roles.indexOf(SUPER_ADMIN_ROLE) > -1) return this.tabs
      const pageName = (this.$route && this.$route.name) || ''
      const prefix = pageName + ':'
      // 菜单表还没有该页的页签行（旧后端/未迁移）时不做过滤，避免整页误隐藏
      if (!menus.some(menu => (menu.name || '').indexOf(prefix) === 0)) return this.tabs
      return this.tabs.filter(tab => !tab.perm || menus.some(menu => menu.name === tab.perm))
    },
    currentComponent() {
      const tab = this.visibleTabs.find(item => item.name === this.active) || this.visibleTabs[0] || {}
      return tab.component
    }
  },
  watch: {
    '$route.query.tab'(value) {
      if (value && value !== this.active && this.visibleTabs.some(tab => tab.name === value)) {
        this.active = value
      }
    },
    visibleTabs(tabs) {
      if (!tabs.some(tab => tab.name === this.active)) {
        this.active = tabs.length ? tabs[0].name : ''
      }
    }
  },
  created() {
    if (!this.visibleTabs.some(tab => tab.name === this.active)) {
      this.active = this.visibleTabs.length ? this.visibleTabs[0].name : ''
    }
  },
  methods: {
    syncQuery() {
      if (this.$route.query.tab === this.active) return
      const query = Object.assign({}, this.$route.query, { tab: this.active })
      this.$router.replace({ path: this.$route.path, query }).catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
@import "src/styles/variables.scss";

.tabbed-page__bar {
  padding: 4px 20px 0;
  background: #fff;
  border-radius: 12px;
  border-bottom: 0;
}

.tabbed-page__body {
  margin-top: 12px;
}

.tabbed-page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 64px 20px;
  border-radius: 12px;
  background: #fff;
  color: $ink-faint;
  font-size: 12.5px;

  p {
    margin: 0;
    color: $ink-secondary;
    font-size: 14px;
    font-weight: 600;
  }
}

.tabbed-page__empty-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: 6px;
  border-radius: 50%;
  background: $brand-soft;
  color: $brand;
  font-size: 18px;
  font-weight: 600;
}
</style>

<!-- vue-loader 13 不支持 ::v-deep，页签内边距用非 scoped 块 -->
<style lang="scss">
.tabbed-page__bar .el-tabs__header {
  margin-bottom: 0;
}
</style>