import Cookies from 'js-cookie'
import approvalTodoApi from '@/api/approvalTodo'

const app = {
  state: {
    sidebar: {
      opened: !+Cookies.get('sidebarStatus'),
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
      if (state.sidebar.opened) {
        Cookies.set('sidebarStatus', 1)
      } else {
        Cookies.set('sidebarStatus', 0)
      }
      state.sidebar.opened = !state.sidebar.opened
    },
    CLOSE_SIDEBAR: (state, withoutAnimation) => {
      Cookies.set('sidebarStatus', 1)
      state.sidebar.opened = false
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
