import store from '@/store'

const MOBILE_WIDTH = 992
const COMPACT_WIDTH = 1280

export default {
  watch: {
    $route(route) {
      if (this.device === 'mobile' && this.drawerVisible) {
        store.dispatch('CloseSideBar', { withoutAnimation: false })
      }
    }
  },
  computed: {
    // 移动端抽屉是否可见
    drawerVisible() {
      return this.sidebar.opened
    }
  },
  beforeMount() {
    window.addEventListener('resize', this.resizeHandler)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resizeHandler)
  },
  mounted() {
    this.resizeHandler()
  },
  methods: {
    resizeHandler() {
      if (document.hidden) {
        return
      }
      const width = window.innerWidth
      const isMobile = width < MOBILE_WIDTH
      const wasMobile = this.device === 'mobile'

      store.dispatch('ToggleDevice', isMobile ? 'mobile' : 'desktop')

      if (isMobile) {
        // 抽屉默认收起
        if (this.sidebar.opened) {
          store.dispatch('CloseSideBar', { withoutAnimation: true })
        }
        return
      }

      // 从窄屏回到桌面端时，恢复用户在桌面端的偏好（展开 / 图标栏）
      if (wasMobile) {
        store.dispatch('RestoreSideBar', { withoutAnimation: true })
        return
      }

      // 中等宽度（平板 / 小笔记本）默认收起为图标栏，避免内容区过窄
      if (width < COMPACT_WIDTH && this.sidebar.opened) {
        store.dispatch('CloseSideBar', { withoutAnimation: true })
      }
    }
  }
}