import http from '../utils/fetch'

// 疗愈师偏好：暂别。对外文案统一为「暂别」，接口内部沿用 block 命名。
export default {
    getPage(params) {
        return http.get({
            url: '/customerMassagistBlock/get/page',
            params: params
        })
    },
    getIds() {
        return http.get({
            url: '/customerMassagistBlock/get/ids'
        })
    },
    createRelation(massagistId) {
        return http.post({
            url: '/customerMassagistBlock/create/relation',
            params: {massagistId}
        })
    },
    remove(id) {
        return http.delete({
            url: `/customerMassagistBlock/${id}`
        })
    }
}
