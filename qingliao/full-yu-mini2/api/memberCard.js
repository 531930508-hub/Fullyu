import http from '../utils/fetch'

export default {
    config() {
        return http.get({
            url: '/memberCard/config',
            showErrorMessage: false
        })
    },
    info() {
        return http.get({
            url: '/memberCard/info',
            showErrorMessage: false
        })
    },
    purchase(data) {
        return http.post({
            url: '/memberCard/purchase',
            data: data || {}
        })
    }
}
