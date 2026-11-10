import Vue from 'vue'
import Vuex from 'vuex'
import app from './modules/app'
import user from './modules/user'
import permission from './modules/permission'
import shop from "./modules/shop";
import getters from './getters'
import goods from "@/store/modules/goods";

Vue.use(Vuex)

const store = new Vuex.Store({
  modules: {
    app,
    shop,
    user,
    permission,
    goods
  },
  getters
})

export default store
