import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/activity/page',
      method: 'get',
      params: params
    })
  },
  doingList() {
    return request({
      url: '/activity/doingList',
      method: 'get',
    })
  },
  buildMiniProgramQrCode(id, pagePath) {
    return request({
      url: '/activity/buildMiniProgramQrCode',
      method: 'put',
      params: {id, pagePath}
    })
  },
  saveOrUpd(data) {
    return request({
      url: '/activity/saveOrUpd',
      method: 'post',
      data
    })
  },
  enable(id) {
    return request({
      url: '/activity/enable',
      method: 'post',
      params: {id}
    })
  },
  disable(id) {
    return request({
      url: '/activity/disable',
      method: 'post',
      params: {id}
    })
  }
}
