import request from '@/utils/request'

export default {
  all() {
    return request({
      url: '/basicCustomerTag/all',
      method: 'get'
    })
  },
  saveOrUpdate(data) {
    return request({
      url: '/basicCustomerTag/saveOrUpdate',
      method: 'post',
      data
    })
  },
  removeByIds(data) {
    return request({
      url: '/basicCustomerTag/removeByIds',
      method: 'delete',
      data
    })
  },
  list() {
    return request({
      url: '/basicCustomerTag/list',
      method: 'get',
    })
  },
  listByTitles(data) {
    return request.post({
      url: '/basicCustomerTag/listByTitles',
      method: 'get',
      data:data
    })
  },
  needFollow() {
    return request({
      url: '/basicCustomerTag/needFollow',
      method: 'get',
    })
  },
  listChildById(categoryId) {
    return request({
      url: '/basicCustomerTag/listChildById',
      method: 'get',
      params: {categoryId}
    })
  },
  listChildByTitle(categoryTitle) {
    return request({
      url: '/basicCustomerTag/listChildByTitle',
      method: 'get',
      params: {categoryTitle}
    })
  }
}
