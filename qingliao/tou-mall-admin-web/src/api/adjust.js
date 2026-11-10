import request from '@/utils/request'

export default {
  saveOrUpd(data) {
    return request({
      url: '/adjust/saveOrUpd',
      method: 'post',
      data
    })
  },
}
