import http from '../utils/fetch'

export default {
    getPage(params) {
        return http.get({
            url: '/giveGift/get/page',
            params: params
        })
    },
    infoById(id) {
        return http.get({
            url: '/giveGift/infoNew',
            params: {id}
        })
    },
    createGift(customerCouponIdList) {
        return http.post({
            url: '/giveGift/give/coupon',
            data: customerCouponIdList
        })
    },
    revocation(params) {
        return http.put({
            url: '/giveGift/revocation',
            params: params
        })
    },
    sendGift(form) {
        return http.post({
            url: '/giveGift/send',
            data: form
        })
    },
    receiveGift(id, shareCode) {
        return http.put({
            url: '/giveGift/get/give/coupon',
            params: {id, shareCode}
        })
    },
    getShareCode(id) {
        return http.get({
            url: '/giveGift/shareCode',
            params: {id}
        })
    },
}
