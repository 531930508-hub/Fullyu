import http from '../utils/fetch'

export default {
  config: () => http.get({url: '/customerNotice/config'}),
  page: params => http.get({url: '/customerNotice/page', params}),
  unread: () => http.get({url: '/customerNotice/unread'}),
  read: id => http.post({url: `/customerNotice/${id}/read`}),
  readAll: () => http.post({url: '/customerNotice/readAll'}),
  consent: data => http.post({url: '/customerNotice/consent', data})
}
