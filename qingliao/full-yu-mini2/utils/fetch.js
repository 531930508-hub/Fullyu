import Request from '@/js_sdk/luch-request/request.js'
import {API_BASE_URL} from '@/utils/appConfig.js'
import cookie from '../utils/cookieUtil'
import cache from "./cache"

const requestInstance = new Request()

// 设置全局配置
requestInstance.setConfig((config) => {
    config.baseUrl = API_BASE_URL // 根域名不同
    config.header = {
        ...config.header
    }
    return config
})


// 自定义验证器，如果返回true，则进入响应拦截器的响应成功函数(resolve)，否则进入响应拦截器的响应错误函数(reject)
requestInstance.validateStatus = (statusCode) => {
    return statusCode === 200
}

let showError = false

function closeError() {
    showError = false
}

function notify(msg = '操作失败', type = 'error', duration = 3000) {
    if (!showError) {
        return
    }
    showError = true
    uni.showToast({
        title: msg,
        icon: type === 'error' ? 'none' : 'success',
        duration: duration
    })
    setTimeout(() => {
        showError = false
    }, duration)
}

// 请求拦截器
requestInstance.interceptor.request((config, cancel) => {
    const token = cookie.getToken()
    if (token) {
        config.header = {
            'Authorization': token,
            'fullyMini': 'fullyMini',
            ...config.header
        }
    } else {
        config.header = {
            'fullyMini': 'fullyMini',
            ...config.header
        }
    }

    const {params,showErrorMessage} = config
    if (showErrorMessage == null || showErrorMessage == undefined) {
        showError = true
    } else {
        showError = false
    }
    const _params = {}
    for (const key in params) {
        const value = params[key]
        if (value === undefined || value === null || value === -1) {
            continue
        } else if (typeof value === 'string' && value.trim() === '') {
            continue
        } else if (Array.isArray(value) && key !== 'order') {
            _params[key] = value.join(',')
        } else if (typeof value === 'object') {
            _params[key] = JSON.stringify(value)
        } else {
            // 其他类型直接赋值
            _params[key] = value
        }
    }
    config.params = _params

    return config
})

// 响应拦截器
requestInstance.interceptor.response((response) => {
    const res = response.data
    if (response.statusCode !== 200 || res.code !== 200) {
        if (res.code == 401) {
            cookie.clearUser()
            //只跳一次登录
            if (!!cache.get('login')){
                return
            }
            cache.put('login',true)
            res.message = '暂未登录'
            // 处理 401 错误，跳转到登录页面
            setTimeout(() => {
                uni.navigateTo({
                    url: '/pages/login/login',
                })
            },500)
        } else if (res.message == '登录授权已过期，请重新登录' || res.message == 'token已经过期！'){
            cookie.clearUser()
            //只跳一次登录
            if (!!cache.get('login')){
                return
            }
            cache.put('login',true)
            setTimeout(() => {
                uni.navigateTo({
                    url: '/pages/login/login',
                })
            },500)
        }
        notify(res.message, 'error')
        return Promise.reject(res.message)
    } else {
        return res.data
    }
}, (response) => {
    if (response.errno == 600001){
        notify('网络异常，请检查网络', 'error')
    } else if (response.errMsg == 'request:fail timeout'){
        notify('请求超时，请检查网络', 'error')
    } else {
        notify('请求异常', 'error')
    }
    return Promise.reject(response)
})

const Fetch = function () {
    const request = function (config) {
        return requestInstance.request(config);
    }

    const get = function (config) {
        return request({
            ...config,
            method: 'GET'
        })
    }
    const post = function (config) {
        return request({
            ...config,
            method: 'POST'
        })
    }
    const put = function (config) {
        return request({
            ...config,
            method: 'PUT'
        })
    }
    const patch = function (config) {
        return request({
            ...config,
            method: 'PATCH'
        })
    }
    const _delete = function (config) {
        return request({
            ...config,
            method: 'DELETE'
        })
    }

    return {
        get,
        post,
        put,
        patch,
        delete: _delete
    }
}

const http = new Fetch()

export default http
