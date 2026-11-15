import Cookies from 'js-cookie'
import approvalTodoApi from '@/api/approvalTodo'

// 侧边栏两种形态：展开（236px）/ 收起为图标栏（72px，opened=false）
// 移动端同一条 opened 走抽屉开合，关闭时不写入桌面端偏好
const readSidebarOpenedFromCookie = () => !+Cookies.get('sidebarStatus')

const app = {
  state: {
    sidebar: {
      opened: readSidebarOpenedFromCookie(),
      withoutAnimation: false
    },
    device: 'desktop',
    // 待办中心角标：当前登录审批人的待审批数量
    todoCount: 0
  },
  mutations: {
    SET_TODO_COUNT: (state, count) => {
      state.todoCount = Number(count) || 0
    },
    TOGGLE_SIDEBAR: state => {
      const sidebar = state.sidebar
      sidebar.opened = !sidebar.opened
      sidebar.withoutAnimation = false
      // 移动端抽屉开关不覆盖桌面端偏好
      if (state.device !== 'mobile') {
        Cookies.set('sidebarStatus', sidebar.opened ? 0 : 1)
      }
    },
    CLOSE_SIDEBAR: (state, withoutAnimation) => {
      // 移动端抽屉关闭 / 窄屏自动收起，不覆盖用户桌面端偏好
      state.sidebar.opened = false
      state.sidebar.withoutAnimation = withoutAnimation
    },
    RESTORE_SIDEBAR: (state, withoutAnimation) => {
      state.sidebar.opened = readSidebarOpenedFromCookie()
      state.sidebar.withoutAnimation = withoutAnimation
    },
    TOGGLE_DEVICE: (state, device) => {
      state.device = device
    }
  },
  actions: {
    ToggleSideBar: ({ commit }) => {
      commit('TOGGLE_SIDEBAR')
    },
    CloseSideBar({ commit }, { withoutAnimation }) {
      commit('CLOSE_SIDEBAR', withoutAnimation)
    },
    RestoreSideBar({ commit }, { withoutAnimation }) {
      commit('RESTORE_SIDEBAR', withoutAnimation)
    },
    ToggleDevice({ commit }, device) {
      commit('TOGGLE_DEVICE', device)
    },
    RefreshTodoCount({ commit }) {
      return approvalTodoApi.count().then(res => {
        commit('SET_TODO_COUNT', res.data || 0)
        return res.data || 0
      }).catch(() => {
        // 角标失败不影响后台使用
        return 0
      })
    }
  }
}

export default app