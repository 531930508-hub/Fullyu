import {adminListAll, getInfo, login, logout} from '@/api/login'
import {getShopId, getToken, removeShopId, removeToken, setShopId, setToken} from '@/utils/auth'

// 历史版本可能把 null/空值写进 cookie，这里统一清洗，避免再用 "null" 调接口
function normalizeShopId(value) {
  if (value === null || value === undefined) return ''
  const str = String(value).trim()
  if (!str || str === 'null' || str === 'undefined' || isNaN(Number(str))) return ''
  return Number(str)
}

const user = {
  state: {
    token: getToken(),
    name: '',
    userId: '',
    shopId: normalizeShopId(getShopId()),
    avatar: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0703/defaultAvatar.png',
    roles: [],
    adminUserList: [],
    massagistId: '',
    trainer: false,
    shopIdArr:''
  },

  mutations: {
    SET_TOKEN: (state, token) => {
      state.token = token
    },
    SET_NAME: (state, name) => {
      state.name = name
    },
    SET_USER_ID: (state, userId) => {
      state.userId = userId
    },
    SET_SHOP_ID: (state, shopId) => {
      state.shopId = shopId
    },
    SET_AVATAR: (state, avatar) => {
      state.avatar = avatar || 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0703/defaultAvatar.png'
    },
    SET_ROLES: (state, roles) => {
      state.roles = roles
    },
    SET_ADMIN_USER_LIST: (state, adminUserList) => {
      state.adminUserList = adminUserList
    },
    SET_MASSAGIST_ID: (state, massagistId) => {
      state.massagistId = massagistId
    },
    SET_TRAINER: (state, trainer) => {
      state.trainer = !!trainer
    },
    SET_ShopIdArr: (state, shopIdArr) => {
      state.shopIdArr = shopIdArr
    },
  },

  actions: {
    // 登录
    Login({commit}, userInfo) {
      const username = userInfo.username.trim()
      return new Promise((resolve, reject) => {
        login(username, userInfo.password).then(response => {
          const data = response.data
          console.log(data)
          const tokenStr = data.tokenHead + data.token
          setToken(tokenStr)
          commit('SET_TOKEN', tokenStr)
          resolve()
        }).catch(error => {
          reject(error)
        })
      })
    },

    // 获取用户信息
    GetInfo({commit, state}) {
      return new Promise((resolve, reject) => {
        getInfo().then(response => {
          const data = response.data
          console.log(data)
          if (data.roles && data.roles.length > 0) { // 验证返回的roles是否是一个非空数组
            commit('SET_ROLES', data.roles)
          } else {
            reject('getInfo: roles must be a non-null array !')
          }
          console.log(data)
          if(data.icon!=null&&!data.icon.includes('https://')){
            data.icon="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/"+data.icon;
          }
          commit('SET_NAME', data.username)
          commit('SET_USER_ID', data.userId)
          commit('SET_ShopIdArr', data.shopIdArr)
          commit('SET_AVATAR', data.icon)
          commit('SET_MASSAGIST_ID', data.massagistId)
          commit('SET_TRAINER', data.trainer)
          const currentShopId = normalizeShopId(getShopId())
          const infoShopId = normalizeShopId(data.shopId) ||
            (Array.isArray(data.shopIdArr) && data.shopIdArr.length ? normalizeShopId(data.shopIdArr[0]) : '')
          if (!currentShopId && infoShopId) {
            commit('SET_SHOP_ID', infoShopId)
            setShopId(infoShopId)
          } else if (!currentShopId) {
            commit('SET_SHOP_ID', '')
            removeShopId()
          } else {
            commit('SET_SHOP_ID', currentShopId)
            setShopId(currentShopId)
          }
          resolve(response)
        }).catch(error => {
          reject(error)
        })
      })
    },

    // 登出
    LogOut({commit, state}) {
      return new Promise((resolve, reject) => {
        logout(state.token).then(() => {
          commit('SET_TOKEN', '')
          commit('SET_ROLES', [])
          commit('SET_SHOP_ID', '')
          commit('SET_TRAINER', false)
          removeToken()
          removeShopId()
          resolve()
        }).catch(error => {
          reject(error)
        })
      })
    },

    // 前端 登出
    FedLogOut({commit}) {
      return new Promise(resolve => {
        commit('SET_TOKEN', '')
        commit('SET_SHOP_ID', '')
        commit('SET_TRAINER', false)
        removeToken()
        removeShopId()
        resolve()
      })
    },

    //获取用户列表用于审批设置用户选择器
    async setAdminUserList({commit, state}, forceUpdate = false) {
      if (state.adminUserList.length == 0 || forceUpdate) {
        let res = await adminListAll()
        let data = res.data || [];
        commit('SET_ADMIN_USER_LIST', data)
      }
    },
    //缓存店铺
    changeShopId({commit, state}, shopId) {
      commit('SET_SHOP_ID', shopId)
      setShopId(shopId)
    },
  }
}

export default user
