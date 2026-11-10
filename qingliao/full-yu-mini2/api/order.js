import http from '../utils/fetch'

export default {
    getPage(params) {
        return http.get({
            url: '/order/get/page',
            params: params
        })
    },
    finishOrder(id) {
        return http.put({
            url: '/order/finish/order',
            params: {id}
        })
    },
    updateOrder(data) {
        return http.post({
            url: '/order/update/order',
            data: data
        })
    },
    infoWithDetail(id) {
        return http.get({
            url: '/order/infoWithDetail',
            params: {id}
        })
    },//获取订单详情以及子级
	infoWithDetailNew(id) {
	    return http.get({
	        url: '/order/infoWithDetailNew',
	        params: {id}
	    })
	},//获取产品订单详情以赠送人详情
	infoWithDetailOrSendInfo(id) {
	    return http.get({
	        url: '/order/infoWithDetailOrSendInfo',
	        params: {id}
	    })
	},
    infoWithGift(id) {
        return http.get({
            url: '/order/infoWithGift',
            params: {id}
        })
    },
    createOrder(data) {
        return http.post({
            url: '/order/create/order',
            data: data
        })
    },
    pageWithDetail(params) {
        return http.get({
            url: '/order/pageWithDetail',
            params: params
        })
    },
    cancelOrder(id,cancelReason) {
        return http.post({
            url: '/order/cancel/order',
            params: {id,cancelReason}
        })
    },
    /**
     * 获取预约时间列表
     * @param {*} params
     * @returns
     */
    timeList(params) {
        return http.get({
            url: '/order/timeList',
            params: params
        })
    },
    /**
     * 获取聊天记录
     * @param params
     * @returns
     */
    chatRecord(params) {
        return http.get({
            url: '/order/chat/page',
            params: params
        })
    },
    /**
     * 发送消息给机器人
     * @param params
     * @returns
     */
    sendMessage(params) {
        return http.post({
            url: '/order/chat/reply',
            params: params
        })
    },
    getCheckoutData(orderId) {
        return http.get({
            url: '/order/checkout',
            params: {orderId}
        })
    },
    //选择优惠方案：0不使用优惠 1年卡提前价 2年卡当日价 3通用折扣 4积分 5Full愈券
    selectPrice(orderId, priceSource) {
        return http.post({
            url: '/order/price/select',
            params: {orderId, priceSource}
        })
    },
    payCheckout(orderId, payType) {
        return http.post({
            url: '/order/pay/checkout',
            params: {orderId, payType}
        })
    },
    checkPaid(orderSn) {
        return http.get({
            url: '/order/check/paid',
            params: {orderSn}
        })
    },
    findBookingDates(shopId = 1) {
        return http.get({
            url: '/order/booking/dates',
            params: {shopId}
        })
    },//二次修改会员卡封面
	updateCardImage(orderId,cardSelectUrl){
		return http.post({
		    url: '/order/updateCardImage',
		    params: {orderId, cardSelectUrl}
		})
	},//会员卡分享
	shareFriend(orderId,titleVal){
		return http.post({
		    url: '/order/shareFriend',
		    params: {orderId,titleVal}
		})
	},//取消卡券分享
	cancelShareCard(orderId){
		return http.get({
			url: '/order/cancelShareCard',
			params: {orderId}
		})
	},//积分支付订单
	jifenPayOrder(orderId){
		return http.get({
			url: '/order/jifenPayOrder',
			params: {orderId}
		})
	},//获取最后一次订单
	getLastOrderInfo(){
		return http.get({
			url: '/order/getLastOrderInfo'
		})
	},
	//获取最后一次订单，用于门店排序
	getLastOrderInfoNew(){
		return http.get({
			url: '/order/getLastOrderInfoNew'
		})
	},//获取最后一次订单
	shareOrder(orderDetailId){
		return http.get({
			url: '/order/shareOrder',
			params: {orderDetailId}
		})
	},//领取好友分享的订单
	receiveOrder(orderDetailId,shareCode){
		return http.post({
			url: '/order/receiveOrder',
			params: {orderDetailId,shareCode}
		})
	},//订单支付完后进行分单
	OrderSplit(orderId){
		return http.get({
			url: '/order/OrderSplit',
			params: {orderId}
		})
	},
	newCustomerZheKou(shopId){
		return http.get({
			url: '/order/newCustomerZheKou',
			params: {shopId}
		})
	}
}
