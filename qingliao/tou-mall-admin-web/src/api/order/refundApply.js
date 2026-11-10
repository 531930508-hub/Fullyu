import request from '@/utils/request'

export default {
  add(data) {
    return request({
      url: '/refundApply/add',
      method: 'post',
      data
    })
  },
}
