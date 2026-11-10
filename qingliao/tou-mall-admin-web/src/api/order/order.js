import request from '@/utils/request'
import fileUtil from "@/utils/fileUtil";

export default {
  page(params) {
    return request({
      url: '/order/page',
      method: 'get',
      params: params
    })
  },
  list(params) {
    return request({
      url: '/order/list',
      method: 'get',
      params
    })
  },
  cancelOrder(id, cancelReason) {
    return request({
      url: '/order/cancel/order',
      method: 'post',
      params: {id, cancelReason}
    })
  },
  cancelRefundOrder(id, cancelReason) {
    return request({
      url: '/order/cancel/refund/order',
      method: 'post',
      params: {id, cancelReason}
    })
  },
  printOrder(id) {
    return request({
      url: '/order/print',
      method: 'get',
      params: {id}
    })
  },
  sendMessageSMS(orderId) {
    return request({
      url: '/order/sendSMS',
      method: 'get',
      params: {orderId}
    })
  },
  info(id) {
    return request({
      url: '/order/info',
      method: 'get',
      params: {id}
    })
  },
  appointmentOrder(data) {
    return request({
      url: '/order/appointment/order',
      method: 'post',
      data
    })
  },
  appointmentReceptionOrder(data) {
    return request({
      url: '/order/appointment/Reception/order',
      method: 'post',
      data
    })
  },
  updateOrder(data) {
    return request({
      url: '/order/pc/update/order',
      method: 'post',
      data
    })
  },
  finishOrder(id) {
    return request({
      url: '/order/finish/order',
      method: 'put',
      params: {id}
    })
  },
  confirmPay(params) {
    return request({
      url: '/order/confirm/pay',
      method: 'put',
      params: params
    })
  },
  timeList(date, personCount, projectId, durationMinutes, shopId, massagistId) {
    return request({
      url: '/order/timeListlx',
      method: 'get',
      params: {date, personCount, projectId, durationMinutes, shopId, massagistId}
    })
  },
  //luxin新增
  timeListEdit(date, personCount, projectId, durationMinutes, shopId,orderId, massagistId) {
    return request({
      url: '/order/timeListEdit',
      method: 'get',
      params: {date, personCount, projectId, durationMinutes, shopId,orderId, massagistId}
    })
  },
  massagistList(dateTime, personCount, durationMinutes, shopId) {
    return request({
      url: '/order/massagistList',
      method: 'get',
      params: {dateTime, personCount, durationMinutes, shopId}
    })
  },
  massagistListNew(dateTime, personCount, durationMinutes, shopId,projectId,phone) {
    return request({
      url: '/order/massagistListNew',
      method: 'get',
      params: {dateTime, personCount, durationMinutes, shopId,projectId,phone}
    })
  },
  bedList(dateTime, projectId, durationMinutes, shopId) {
    return request({
      url: '/order/bedList',
      method: 'get',
      params: {dateTime, projectId, durationMinutes, shopId}
    })
  },
  bookingDates(yyyyMMdd = null, shopId = 1) {
    return request({
      url: '/order/booking/dates',
      method: 'get',
      params: {maxCount: 4, yyyyMMdd, isPc: 1, shopId}
    })
  },
  bookingDatesNew(shopId,yyyyMMdd = null, maxCount = 4, isPc = 1) {
    return request({
      url: '/order/booking/datesNew',
      method: 'get',
      params: {maxCount, yyyyMMdd, isPc,shopId}
    })
  },
  updateComment(id, comment) {
    return request({
      url: '/order/comment',
      method: 'put',
      params: {id, comment}
    })
  },
  updateCouponCode(id, couponCode) {
    return request({
      url: '/order/couponCode',
      method: 'put',
      params: {id, couponCode}
    })
  },
  updatePayAmount(id, payAmount) {
    return request({
      url: '/order/payAmount',
      method: 'put',
      params: {id, payAmount}
    })
  },
  getPayCode(orderSn, payChannel) {
    return request({
      url: '/admin/open/dgpay/pay/code',
      method: 'get',
      responseType: 'blob',
      params: {orderSn, payChannel}
    })
  },
  exportExcel(params) {
    return request({
      url: '/order/export',
      method: 'get',
      params,
      responseType: 'blob',
      timeout: 90000
    }).then(res => {
      fileUtil.exportSave(res, "导出订单列表.xlsx")
    })
  },
  payedInfo(orderCode) {
    return request({
      url: '/order/payed/info',
      method: 'get',
      params: {orderCode}
    })
  },
  errorRefundOrder(orderId) {
    return request({
      url: '/order/errorRefundOrder',
      method: 'post',
      params: {orderId}
    })
  },
  addLabel(data) {
    return request({
      url: '/order/addLabel',
      method: 'post',
      data
    })
  },//后台创建卡卷订单
  createOrder(data){
    return request({
      url: '/order/create/pcorder',
      method: 'post',
      data
    })
  },//后台关闭支付时，取消卡卷订单
  exceCancelOrder(orderId){
    return request({
      url: '/order/exceCancelOrder',
      method: 'post',
      params: {orderId}
    })
  },
  updateOrderInvoiceStatus(id, params){
    return request({
      url: '/order/updateOrderInvoiceStatus/' + id,
      method: 'post',
      params: params
    })
  },
}
