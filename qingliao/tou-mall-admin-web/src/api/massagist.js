import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/massagist/page',
      method: 'get',
      params: params
    })
  },
  saveOrUpd(data) {
    return request({
      url: '/massagist/saveOrUpd',
      method: 'post',
      data
    })
  },
  list(params) {
    return request({
      url: '/massagist/list',
      method: 'get',
      params
    })
  },
  identityOptions() {
    return request({
      url: '/massagist/identityOptions',
      method: 'get'
    })
  },
  identities(id) {
    return request({
      url: '/massagist/identities',
      method: 'get',
      params: {id}
    })
  },
  findSortList(day, shopId) {
    return request({
      url: '/massagist/sortList',
      method: 'get',
      params: {day, shopId}
    })
  },
  remove(id) {
    return request({
      url: '/massagist/remove',
      method: 'delete',
      params: {id}
    })
  },
  relatedMassagist(umsAdminId, massagistId) {
    return request({
      url: '/massagist/relatedMassagist',
      method: 'post',
      params: {umsAdminId, massagistId}
    })
  },
  rerank(day, shopId, data) {
    return request({
      url: '/massagist/rerank',
      method: 'put',
      params: {day, shopId},
      data
    })
  },
  pageComment(params) {
    return request({
      url: '/massagistRate/pageComment',
      method: 'get',
      params: params
    })
  },
  pageMassagistRating(params) {
    return request({
      url: '/massagistRate/pageMassagistRating',
      method: 'get',
      params: params
    })
  }
}
