import http from '../utils/fetch'

export default {
    list(params) {
        return http.get({
            url: '/shop/get/list',
            params: params
        })
    },
    maxBedCount(shopId,type) {
        return http.get({
            url: '/bed/maxBedCount',
            params: {shopId,type}
        })
    }
}
