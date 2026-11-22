import request from '@/utils/request'

export default {
  //队序 + 今日接单数（服务队/接待队各一份，只读不建队列）
  queuePositions(params) {
    return request({
      url: '/roundSchedule/queue/positions',
      method: 'get',
      params: params
    })
  },
  swapQueue(shopId, date, massagistIdA, massagistIdB) {
    return request({
      url: '/roundSchedule/queue/swap',
      method: 'post',
      params: {shopId: shopId, date: date, massagistIdA: massagistIdA, massagistIdB: massagistIdB}
    })
  },
  page(params) {
    return request({
      url: '/roundSchedule/page',
      method: 'get',
      params: params
    })
  },
}
