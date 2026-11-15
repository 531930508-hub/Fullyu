import http from '../utils/fetch'

export default {
	getPage(params) {
		return http.get({
			url: '/customerCoupon/get/page',
			params: params
		})
	},
	getCouponCount() {
		return http.get({
			url: '/customerCoupon/getCouponCount'
		})
	}, //获取用户的所有卡券数量
	getUserAllCouponCount() {
		return http.get({
			url: '/customerCoupon/getUserAllCouponCount',
		})
	},//获取用户最后一次购卡劵信息
	getUserLastoneCoupon(){
		return http.get({
			url: '/customerCoupon/getUserLastoneCoupon',
		})
	},//获取用户的组合券
	getGroupCard(state){
		return http.get({
			url: '/customerCoupon/getGroupCard',
			params: {state}
		})
	},//获取用户的组合券
	getShareGroupCard(state){
		return http.get({
			url: '/customerCoupon/getShareGroupCard',
			params: {state}
		})
	},//获取单张券
	getSingleCard(state){
		return http.get({
			url: '/customerCoupon/getSingleCard',
			params: {state}
		})
	}
}