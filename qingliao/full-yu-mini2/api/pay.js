import http from '../utils/fetch'

export default {
    getOpenId(params) {
        return http.post({
            url: '/admin/open/wx/openId',
            params: params
        })
    },
    getPhone(params) {
        return http.get({
            url: '/admin/open/wx/phone',
            params: params
        })
    },
    genPayInfo(orderId, openId) {
        return http.get({
            url: '/pay/gen',
            params: {
                orderId, openId
            }
        })
    }
}
