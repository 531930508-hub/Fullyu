import http from '../utils/fetch'

export default {
    receive(password) {
        return http.post({
            url: '/giftCard/receive',
            params: {password},
            showErrorMessage: false
        })
    }
}
