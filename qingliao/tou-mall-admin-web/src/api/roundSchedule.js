import request from '@/utils/request'

export default {
  findMassagistRound(params) {
    return request({
      url: '/roundSchedule/get/massagist/round',
      method: 'get',
      params: params
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
