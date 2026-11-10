import store from '@/store'

const MOBILE_WIDTH = 992
const COMPACT_WIDTH = 1280

export default {
  watch: {
    $route(route) {
      if (this.device === 'mobile' && this.sidebar.opened) {
        store.dispatch('CloseSideBar', { withoutAnimation: false })
      }
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
        if (this.sidebar.opened) {
          store.dispatch('CloseSideBar', { withoutAnimation: true })
        }
        return
      }

      // 从窄屏回到桌面端时自动展开，桌面端内则保留用户的收起选择
      if (wasMobile) {
        if (!this.sidebar.opened) {
          store.dispatch('ToggleSideBar')
        }
        return
      }

      // 中等宽度（平板 / 小笔记本）默认收起为图标栏，避免内容区过窄
      if (width < COMPACT_WIDTH && this.sidebar.opened) {
        store.dispatch('CloseSideBar', { withoutAnimation: true })
      }
    }
  }
}