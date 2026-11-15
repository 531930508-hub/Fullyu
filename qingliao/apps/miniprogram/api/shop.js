import http from '../utils/fetch'

export default {
    list(params) {
        return http.get({
            url: '/shop/listAll',
            params: params
        })
    },
    maxBedCount(shopId,type) {
        return http.get({
            url: '/bed/maxBedCount',
            params: {shopId,type}
        })
    },
	minilist(params){
		return http.get({
		    url: '/shop/minilist',
		    params: params
		})
	}
	,
	miniCityAndStreet(params){
		return http.get({
		    url: '/shop/miniCityAndStreet',
		    params: params
		})
	},
	miniShopCollect(userMobile){
		return http.get({
		    url: '/shop/miniShopCollect',		   
		})
	},
	miniInsterOrDelete(shopId)
	{
		return http.get({
		    url: '/shop/miniInsterOrDelete',
		    params: {shopId}
		})
	},//获取最大的接单人数
	maxPeopleCount(shopId,type,date) {
	    return http.get({
	        url: '/bed/maxPeopleCount',
	        params: {shopId,type,date}
	    })
	}
	,//获取单个门店信息
	getSingleByShopId(shopId) {
	    return http.get({
	        url: '/shop/getSingleByShopId',
	        params: {shopId}
	    })
	},
}
