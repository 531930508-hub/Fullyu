<template>
  <div class="app-wrapper" :class="classObj">
    <sidebar class="sidebar-container"></sidebar>
    <div v-show="device === 'mobile' && sidebar.opened" class="sidebar-mask"
         @click="closeSideBar"></div>
    <div class="main-container">
      <navbar v-if="!hideNavbar"></navbar>
      <app-main></app-main>
    </div>
  </div>
</template>

<script>
import { Navbar, Sidebar, AppMain } from './components'
import ResizeMixin from './mixin/ResizeHandler'

export default {
  name: 'layout',
  components: {
    Navbar,
    Sidebar,
    AppMain
  },
  mixins: [ResizeMixin],
  data() {
    return {
      todoTimer: null
    }
  },
  mounted() {
    this.syncShellClass()
    this.$store.dispatch('RefreshTodoCount')
    this.todoTimer = setInterval(() => {
      this.$store.dispatch('RefreshTodoCount')
    }, 60000)
  },
  beforeDestroy() {
    if (this.todoTimer) {
      clearInterval(this.todoTimer)
      this.todoTimer = null
    }
    document.body.classList.remove('app-shell', 'app-shell--collapsed')
  },
  watch: {
    // 弹窗（append-to-body 后挂在 body 上）需要知道侧栏状态，才能把内容区和弹窗对齐
    classObj() {
      this.syncShellClass()
    }
  },
  methods: {
    closeSideBar() {
      this.$store.dispatch('CloseSideBar', { withoutAnimation: false })
    },
    syncShellClass() {
      const { hideSidebar } = this.classObj
      document.body.classList.add('app-shell')
      document.body.classList.toggle('app-shell--collapsed', !!hideSidebar)
    }
  },
  computed: {
    sidebar() {
      return this.$store.state.app.sidebar
    },
    device() {
      return this.$store.state.app.device
    },
    hideNavbar() {
      return this.$route.meta && this.$route.meta.hideNavbar
    },
    classObj() {
      const sidebar = this.sidebar
      return {
        hideSidebar: !sidebar.opened,
        withoutAnimation: sidebar.withoutAnimation,
        mobile: this.device === 'mobile'
      }
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
@import "src/styles/variables.scss";

.app-wrapper {
  position: relative;
  min-height: 100vh;
  width: 100%;
}

.sidebar-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: rgba(28, 27, 32, .42);
  backdrop-filter: blur(2px);
  animation: sidebar-mask-in .2s ease;
}

@keyframes sidebar-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>