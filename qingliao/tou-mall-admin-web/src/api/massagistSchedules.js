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
  // 周视图：一周排班（含调入本店的调店段）
  weekBoard(params) {
    return request({
      url: '/massagistSchedules/weekBoard',
      method: 'get',
      params
    })
  },
  // 疗愈师本人某天的排班门店（当天调店取目标店）
  myDay(date) {
    return request({
      url: '/massagistSchedules/myDay',
      method: 'get',
      params: {date}
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
  restoreTransfer(id) {//撤销调店并恢复原店排班
    return request({
      url: '/massagistSchedules/restoreTransfer',
      method: 'post',
      params: {id}
    })
  },
}
