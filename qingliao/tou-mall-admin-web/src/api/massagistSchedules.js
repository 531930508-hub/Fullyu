import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/massagistSchedules/page',
      method: 'get',
      params: params
    })
  },
  saveOrUpd(data) {
    return request({
      url: '/massagistSchedules/saveOrUpd',
      method: 'post',
      data
    })
  },
  saveTargetShop(data) {//luxin新增
    return request({
      url: '/massagistSchedules/saveTargetShop',
      method: 'post',
      data
    })
  },
  batchTargetShop(data){//luxin新增
    return request({
      url: '/massagistSchedules/batchTargetShop',
      method: 'post',
      data
    })
  },
  batchAdd(data){
    return request({
      url: '/massagistSchedules/batchAdd',
      method: 'post',
      data
    })
  },
  list(params) {
    return request({
      url: '/massagistSchedules/list',
      method: 'get',
      params
    })
  },
  clearFuture(massagistId, shopId) {
    return request({
      url: '/massagistSchedules/clearFuture',
      method: 'post',
      params: {massagistId, shopId}
    })
  },
  changeLogs(params) {
    return request({
      url: '/massagistSchedules/changeLogs',
      method: 'get',
      params
    })
  },
  remove(id) {
    return request({
      url: '/massagistSchedules/remove',
      method: 'delete',
      params: {id}
    })
  },
}
