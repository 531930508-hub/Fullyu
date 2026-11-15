import request from '@/utils/request'

export default {
  // 台账分页：module/operator/startTime/endTime/page/size
  page(params) {
    return request({
      url: '/exportRecord/page',
      method: 'get',
      params
    })
  },
  // 台账里出现过的模块，用于筛选下拉
  modules() {
    return request({
      url: '/exportRecord/modules',
      method: 'get'
    })
  },
  detail(id) {
    return request({
      url: `/exportRecord/${id}`,
      method: 'get'
    })
  }
}