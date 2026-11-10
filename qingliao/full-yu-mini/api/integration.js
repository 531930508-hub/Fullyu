import http from '../utils/fetch'

export default {
    prizeDraw(orderId) {
        return http.post({
            url: '/integration/prizeDraw',
            params: {orderId}
        })
    }
}
