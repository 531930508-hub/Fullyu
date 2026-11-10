import projectApi from "@/api/goods/project";
import productApi from "@/api/goods/product";
import approvalCategoryApi from "@/api/shop/approvalCategory";
import couponApi from "@/api/goods/coupon";
import activityApi from "@/api/promotion/activity";

const goods = {
  state: {
    projectList: [],
    productList: [],
    approvalCategoryList: [],
    couponList: [],
    activityDoingList: [],
    approvalCategoryListShop:[],
  },
  mutations: {
    SET_PROJECT_LIST: (state, projectList) => {
      state.projectList = projectList || []
    },
    SET_COUPON_LIST: (state, couponList) => {
      state.couponList = couponList || []
    },
    SET_ACTIVITY_DOING_LIST: (state, activityDoingList) => {
      state.activityDoingList = activityDoingList || []
    },
    SET_PRODUCT_LIST: (state, productList) => {
      state.productList = productList || []
    },
    SET_APPROVAL_CATEGORY_LIST: (state, approvalCategoryList) => {
      state.approvalCategoryList = approvalCategoryList || []
    },
    SET_APPROVAL_CATEGORY_LIST_SHOP: (state, approvalCategoryListShop) => {
      state.approvalCategoryListShop = approvalCategoryListShop || []
    }
  },
  actions: {
    async setProjectList({commit, state}, forceUpdate = false) {
      console.log("setProjectList", forceUpdate)
      if (state.projectList.length == 0 || forceUpdate) {
        let res = await projectApi.list({category: 1, state: 1})
        let data = res.data || [];
        commit('SET_PROJECT_LIST', data)
      }
    },
    async setCouponList({commit, state}, forceUpdate = false) {
      if (state.couponList.length == 0 || forceUpdate) {
        let res = await couponApi.list()
        let data = res.data || [];
        commit('SET_COUPON_LIST', data)
      }
    },
    async setActivityDoingList({commit, state}, forceUpdate = false) {
      if (state.activityDoingList.length == 0 || forceUpdate) {
        let res = await activityApi.doingList()
        let data = res.data || [];
        commit('SET_ACTIVITY_DOING_LIST', data)
      }
    },
    async setProductList({commit, state}, forceUpdate = false) {
      if (state.productList.length == 0 || forceUpdate) {
        let res = await productApi.list({type: 0, state: 1})
        let data = res.data || [];
        commit('SET_PRODUCT_LIST', data)
      }
    },
    async setApprovalCategoryList({commit, state}, forceUpdate = false) {
      console.log("---");
      if (state.approvalCategoryList.length == 0 || forceUpdate) {
        let res = await approvalCategoryApi.listByShopId({shop_id: forceUpdate[1]})
        let data = res.data || [];
        console.log(data)
        commit('SET_APPROVAL_CATEGORY_LIST_SHOP', data)
      }
    },
  }
}
export default goods
