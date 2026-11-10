import http from '../utils/fetch'

export default {
    prizeDraw(orderId) {
        return http.post({
            url: '/integration/prizeDraw',
            params: {orderId}
        })
    },
	getIntegrationRecord(params){
		return http.get({
		    url: '/integration/getIntegrationRecord',
		     params: params
		})
	}
}
