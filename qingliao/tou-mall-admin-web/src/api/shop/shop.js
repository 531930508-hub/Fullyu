import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/shop/page',
      method: 'get',
      params: params
    })
  },
  saveOrUpd(data) {
    return request({
      url: '/shop/saveOrUpd',
      method: 'post',
      data
    })
  },
  listAll(params) {
    return request({
      url: '/shop/listAll',
      method: 'get',
      params
    })
  },
  list(params) {
    return request({
      url: '/shop/list',
      method: 'get',
      params
    })
  },
  listByAdminId(id) {
    return request({
      url: '/shop/listByAdminId',
      method: 'get',
      params:{id}
    })
  },
  remove(id) {
    return request({
      url: '/shop/remove',
      method: 'delete',
      params: {id}
    })
  },
  timeList(id) {
    return request({
      url: '/shop/timeList',
      method: 'get',
      params: {id}
    })
  },
  timeShopEnd(id) {
    return request({
      url: '/shop/timeShopEnd',
      method: 'get',
      params: {id}
    })
  },
  timeListNew(id, time) {
    return request({
      url: '/order/timeListNew',
      method: 'get',
      params: {id,time}
    })
  },
  getReceptionData(id) {
    return request({
      url: '/shop/receptionData',
      method: 'get',
      params: {id}
    })
  },
}
