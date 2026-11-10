import http from '../utils/fetch'

export default {
    getList() {
        return http.get({
            url: '/customerMassagistRelation/get/list'
        })
    },
    getPage(params) {
        return http.get({
            url: '/customerMassagistRelation/get/page',
            params: params
        })
    },
    createRelation(massagistId) {
        return http.post({
            url: '/customerMassagistRelation/create/relation',
            params: {massagistId}
        })
    },
    remove(id) {
        return http.delete({
            url: `/customerMassagistRelation/${id}`
        })
    }
}
