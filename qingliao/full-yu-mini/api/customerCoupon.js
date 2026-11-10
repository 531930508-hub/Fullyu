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
    }
}
