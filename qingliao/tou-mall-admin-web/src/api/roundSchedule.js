import request from '@/utils/request'

export default {
  findMassagistRound(params) {
    return request({
      url: '/roundSchedule/get/massagist/round',
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
