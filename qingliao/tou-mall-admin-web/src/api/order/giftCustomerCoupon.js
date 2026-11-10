import request from '@/utils/request'
import fileUtil from '@/utils/fileUtil'

export default {
  add(data) {
    return request({
      url: '/giftCustomerCoupon/add',
      method: 'post',
      data
    })
  },
  template() {
    return request({url: '/giftCustomerCoupon/import/template', method: 'get', responseType: 'blob'})
      .then(res => fileUtil.exportSave(res, '批量送券申请.xlsx'))
  },
  importExcel(file,shopId) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('shopId', shopId)
    return request.post('/giftCustomerCoupon/import/add',formData,{
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  }
}
