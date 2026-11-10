import request from '@/utils/request'

export default {
  importExcel(file) {
    const formData = new FormData()
    formData.append('file', file)
    return request.post('/integration/import/add',formData,{
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  adjust(data) {
    return request({
      url: '/integration/adjust',
      method: 'post',
      data
    })
  },
  operationPage(params) {
    return request({
      url: '/integration/operation/page',
      method: 'get',
      params
    })
  },
  page(params) {
    return request({
      url: '/integration/page',
      method: 'get',
      params: params
    })
  }
}
