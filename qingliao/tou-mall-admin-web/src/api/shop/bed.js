import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/bed/page',
      method: 'get',
      params: params
    })
  },
  saveOrUpd(data) {
    return request({
      url: '/bed/saveOrUpd',
      method: 'post',
      data
    })
  },
  list(params) {
    return request({
      url: '/bed/list',
      method: 'get',
      params
    })
  },
  remove(id) {
    return request({
      url: '/bed/remove',
      method: 'delete',
      params: {id}
    })
  },
  maxBedCount(shopId,type) {
    return request({
      url: '/bed/maxBedCount',
      method: 'get',
      params:{shopId,type}
    })
  },
  pagelist(params) {
    return request({
      url: '/customerCoupon/getListData',
      method: 'get',
      params: params
    })
  },
  getListDataExce(params) {
    return request({
      url: '/customerCoupon/getListDataExce',
      method: 'get',
      params: params
    })
  },
}
