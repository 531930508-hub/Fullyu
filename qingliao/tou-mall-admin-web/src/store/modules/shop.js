import shopApi from "@/api/shop/shop";
import roomApi from "@/api/shop/room";
import massagistApi from "@/api/massagist";

const shop = {
  state: {
    shopList: [],
    roomList: [],
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
    SET_ROOM_LIST: (state, roomList) => {
      state.roomList = roomList || []
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
        let res = await shopApi.listAll()
        let data = res.data || [];
        commit('SET_SHOP_LIST_All', data)
      }
    },
    async setRoomList({commit, state}, forceUpdate = false) {
      if (state.roomList.length == 0 || forceUpdate) {
        let res = await roomApi.list()
        let data = res.data || [];
        commit('SET_ROOM_LIST', data)
      }
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
