import shopApi from "@/api/shop/shop";
import massagistApi from "@/api/massagist";

const shop = {
  state: {
    shopList: [],
    shopListAll: [],
    massagistList: [],
  },
  mutations: {
    SET_SHOP_LIST: (state, shopList) => {
      console.log("shopList-----")
      console.log(shopList)
      state.shopList = shopList || []
    },
    SET_SHOP_LIST_All: (state, shopListAll) => {
      state.shopListAll = shopListAll || []
    },
    SET_MASSAGIST_LIST: (state, massagistList) => {
      state.massagistList = massagistList || []
    },
  },
  actions: {
    async setShopList({commit, state}, forceUpdate = false) {
      if (state.shopList.length == 0 || forceUpdate) {
      console.log(this.userId)
        let res = await shopApi.list()
        console.log("res.data-------")
        console.log(res.data)
        let data = res.data || [];
        commit('SET_SHOP_LIST', data)
      }
    },
    async setShopAllList({commit, state}, forceUpdate = false) {
      if (state.shopListAll.length == 0 || forceUpdate) {
        // 只取服务端授权范围内的门店，防止受限账号拿到全量门店
        let res = await shopApi.authorized()
        let data = res.data || [];
        commit('SET_SHOP_LIST_All', data)
      }
    },
    // 语义化别名，新代码统一使用
    async setAuthorizedShopList({dispatch}, forceUpdate = false) {
      return dispatch('setShopAllList', forceUpdate)
    },
    async setMassagistList({commit, state}, forceUpdate = false) {
      if (state.massagistList.length == 0 || forceUpdate) {
        let res = await massagistApi.list()
        let data = res.data || [];
        commit('SET_MASSAGIST_LIST', data)
      }
    },
  }
};

export default shop
