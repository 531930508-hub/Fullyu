import http from '../utils/fetch'

export default {
    createBatch(data) {
        return http.post({
            url: '/massagistRate/create/batch',
            data: data
        })
    }
}
