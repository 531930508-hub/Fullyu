import axios from 'axios'
import {Message, MessageBox} from 'element-ui'
import store from '../store'
import {getToken} from '@/utils/auth'
import Bus from "@/utils/Bus";
// 创建axios实例
const service = axios.create({
  baseURL: process.env.BASE_API, // api的base_url
  timeout: 1500000 // 请求超时时间
})

// request拦截器
service.interceptors.request.use(config => {
  if (store.getters.token) {
    config.headers['Authorization'] = getToken() // 让每个请求携带自定义token 请根据实际情况自行修改
  }
  const {method} = config
  if (method === 'get') {
    config = buildAuth(config)
  }
  return config
}, error => {
  // Do something with request error
  console.log(error) // for debug
  Promise.reject(error)
})

// respone拦截器
service.interceptors.response.use(
  response => {
    /**
     * code为非200是抛错 可结合自己业务进行修改
     */
    const res = response.data
    const headers = response.headers
    const contentType = headers['content-type']
    if (contentType && contentType != 'application/json') {
      return response
    }
    if (res.code !== 200) {
      Message({
        message: res.message,
        type: 'error',
        duration: 3 * 1000
      })

      // 401:未登录;
      if (res.code === 401) {
        MessageBox.confirm('你已被登出，可以取消继续留在该页面，或者重新登录', '确定登出', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          store.dispatch('Fed').then(() => {
            location.reload()// 为了重新实例化vue-router对象 避免bug
          })
        })
      }
      Bus.$emit('hideFullLoading')
      return Promise.reject('error')
    } else {
      return response.data
    }
  },
  error => {
    console.log('err' + error)// for debug
    Message({
      message: error.message,
      type: 'error',
      duration: 3 * 1000
    })
    Bus.$emit('hideFullLoading')
    return Promise.reject(error)
  }
)

function buildAuth(config) {
  const {params} = config
  const _params = new URLSearchParams()
  for (const key in params) {
    const value = params[key]
    if (value === undefined || value === null) {
      continue
    } else if (typeof value === 'string' && value.trim() === '') {
      continue
    } else if (Array.isArray(value) && key !== 'order') {
      for (const k in value) {
        _params.append(key, value[k])
      }
    } else if (typeof value === 'object') {
      _params.append(key, JSON.stringify(value))
    } else {
      _params.append(key, value)
    }
  }
  config.params = _params
  return config
}

export default service
