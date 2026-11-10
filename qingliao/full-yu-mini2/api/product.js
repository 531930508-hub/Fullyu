import http from '../utils/fetch'

export default {
    list(params) {
        return http.get({
            url: '/product/get/list',
            params: params
        })
    },
	productlist() {
	    return http.get({
	        url: '/product/productList'
	    })
	}
}
