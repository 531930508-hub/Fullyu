import http from '../utils/fetch'

export default {
    getList(params) {
        return http.get({
            url: '/massagist/get/list',
            params: params
        })
    },
    getPage(params) {
        return http.get({
            url: '/massagist/get/page',
            params: params
        })
    }
}
