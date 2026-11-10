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
    },
}
