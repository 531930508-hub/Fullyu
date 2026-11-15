import request from '@/utils/request'

// 身份由后端登录态确定，客户端不传管理员ID或公众号身份。
export default {
  status() { return request({url: '/adminNotice/status', method: 'get'}) },
  logs(params) { return request({url: '/adminNotice/logs', method: 'get', params}) },
  unlink() { return request({url: '/adminNotice/binding/unlink', method: 'post'}) },
  oauthUrl() { return request({url: '/adminNotice/binding/oauth-url', method: 'post'}) },
  testSend() { return request({url: '/adminNotice/binding/test-send', method: 'post'}) }
}
