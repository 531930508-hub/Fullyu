import Request from '@/js_sdk/luch-request/request.js'
import {API_BASE_URL} from '@/utils/appConfig.js'
import cookie from '../utils/cookieUtil'
import cache from "./cache"
import { t } from './locale'
import { syncServerClock } from './serverClock'

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

// 提示节流：一次连发多个失败只提示一条
let lastToastAt = 0

// 默认文案在调用时取词，保证切语言后的提示是当前语言
function notify(msg = t('操作失败'), type = 'error', duration = 3000) {
    const now = Date.now()
    if (now - lastToastAt < duration) {
        return
    }
    lastToastAt = now
    uni.showToast({
        title: msg,
        icon: type === 'error' ? 'none' : 'success',
        duration: duration
    })
}

/**
 * 是否允许弹提示：看这次请求自己的 showErrorMessage（默认弹，显式传 false 才静默）。
 * 不能用全局开关：首屏十几个请求并发，后发的请求会覆盖先发请求的设置，
 * 结果是本该静默的接口失败被隔壁请求「点亮」，冒出一条莫名其妙的「请求异常」。
 */
function shouldNotify(config) {
    return !(config && config.showErrorMessage === false)
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

    const {params} = config
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
    // 用服务端给的 Date 头顺带校准设备时钟：支付倒计时只有 5 分钟，
    // 手机时钟偏几十秒就足以让支付入口提前消失或延后放行。
    // 只是顺手校准，失败不影响请求本身的成败。
    try {
        const headers = (response && response.header) || {}
        syncServerClock(headers.Date || headers.date)
    } catch (e) {
        // 校准失败保持原时钟，不影响业务
    }
    const res = response.data
    if (response.statusCode !== 200 || res.code !== 200) {
        if (res.code == 401) {
            cookie.clearUser()
            //只跳一次登录
            if (!!cache.get('login')){
                return
            }
            cache.put('login',true)
            res.message = t('暂未登录')
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
        // 服务端文案可能是本端词典里的界面语，命不中时 t 原样返回；缺文案时落回默认提示
        if (shouldNotify(response.config)) {
            notify((res.message && t(res.message)) || undefined, 'error')
        }
        return Promise.reject(res.message)
    } else {
        return res.data
    }
}, (response) => {
    const err = response || {}
    const config = err.config || {}
    // 服务端返回非 200 时 luch-request 也走这个分支（validateStatus 只认 200），
    // 用户侧统一一句「请求异常」分不出是谁，这里留一条带状态码的日志给真机排查用。
    console.warn('[request-fail]', config.url, err.statusCode, err.errMsg, err.errno)
    if (shouldNotify(config)) {
        if (err.errno == 600001){
            notify(t('网络异常，请检查网络'), 'error')
        } else if (err.errMsg == 'request:fail timeout'){
            notify(t('请求超时，请检查网络'), 'error')
        } else {
            notify(t('请求异常'), 'error')
        }
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
