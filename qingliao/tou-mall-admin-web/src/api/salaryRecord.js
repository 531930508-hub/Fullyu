import request from '@/utils/request'

export default {
  people(params) {
    return request({url: '/salaryRecord/people', method: 'get', params})
  },
  info(params) {
    return request({
      url: '/salaryRecord/info',
      method: 'get',
      params: params
    })
  },
  reset(params) {
    return request({
      url: '/salaryRecord/reset',
      method: 'post',
      params: params
    })
  },
  resetRecordNew(){
    return request({
      url: '/salaryRecord/resetRecordNew',
      method: 'get'
    })
  },
  findMassagistAllMonthCode(massagistId) {
    return request({
      url: '/salaryRecord/findMassagistAllMonthCode',
      method: 'get',
      params: {massagistId}
    })
  }
}
