/**
 * 页面埋点：停留时长 / 页面监控
 *
 * 后端接口（mall 服务）：
 *   POST /customer/page-event/createList  页面访问明细，一条停留数据一行
 *   （另有 /customer/page-event/monitor 页面监控入口，字段与上面一致；
 *    两个都发会产生重复数据，所以这里只发 createList，需要切换时改 PATH_EVENT 即可）
 *
 * 约束（埋点不能成为新的卡顿源）：
 * 1. 用 uni.request 直发，不走 utils/fetch 的拦截器：不弹 toast、不触发 401 跳登录；
 * 2. 不 await、不阻塞页面切换，失败静默；
 * 3. 失败的记录落本地队列（最多 20 条），下次冷启动补发，不会无限膨胀；
 * 4. 只在 onShow / onHide / onUnload 触发，不挂定时器、不轮询。
 */
import { API_BASE_URL } from './appConfig'
import cookie from './cookieUtil'
import { routeTitle } from './locale'

const QUEUE_KEY = 'fullyu.lightheal.trackQueue'
const MAX_QUEUE = 20
const SEND_TIMEOUT = 8000
const PATH_EVENT = '/customer/page-event/createList'

let sessionId = ''
let scene = ''
let lastPath = ''
/** 当前停留中的页面：{ path, title, enterAt } */
let currentPage = null
let envInfo = null

function uuid() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

function getEnvInfo() {
    if (envInfo) return envInfo
    envInfo = {}
    try {
        const sys = uni.getSystemInfoSync() || {}
        envInfo = {
            brand: sys.brand || '',
            model: sys.model || '',
            system: sys.system || '',
            platform: sys.platform || '',
            screenWidth: sys.screenWidth || 0,
            screenHeight: sys.screenHeight || 0,
            SDKVersion: sys.SDKVersion || ''
        }
    } catch (error) {
        envInfo = {}
    }
    return envInfo
}

function getAppVersion() {
    try {
        const info = uni.getAccountInfoSync && uni.getAccountInfoSync()
        return (info && info.miniProgram && info.miniProgram.version) || ''
    } catch (error) {
        return ''
    }
}

function getCurrentRoute() {
    try {
        const pages = getCurrentPages()
        const page = pages[pages.length - 1]
        if (!page) return ''
        return page.route || (page.$page && page.$page.route) || ''
    } catch (error) {
        return ''
    }
}

function readQueue() {
    try {
        const raw = uni.getStorageSync(QUEUE_KEY)
        return Array.isArray(raw) ? raw : []
    } catch (error) {
        return []
    }
}

function writeQueue(list) {
    try {
        uni.setStorageSync(QUEUE_KEY, list.slice(-MAX_QUEUE))
    } catch (error) {
        // 本地存储失败就丢掉，埋点不重试到底
    }
}

function send(path, data) {
    return new Promise((resolve) => {
        const header = { 'fullyMini': 'fullyMini' }
        const token = cookie.getToken()
        if (token) header.Authorization = token
        uni.request({
            url: API_BASE_URL + path,
            method: 'POST',
            data,
            header,
            timeout: SEND_TIMEOUT,
            success: (res) => resolve(res && res.statusCode === 200),
            fail: () => resolve(false)
        })
    })
}

/** 上报：失败就入队等下次补发 */
function report(data) {
    send(PATH_EVENT, data).then((ok) => {
        if (!ok) {
            writeQueue(readQueue().concat([data]))
        }
    })
}

/** 冷启动补发上次失败的数据（只发一遍，失败就留在队列里） */
export function flushTrackingQueue() {
    const list = readQueue()
    if (!list.length) return
    writeQueue([])
    const pending = []
    setTimeout(() => {
        list.reduce((chain, item) => chain.then(() => {
            return send(PATH_EVENT, item).then((ok) => {
                if (!ok) pending.push(item)
            })
        }), Promise.resolve()).then(() => {
            if (pending.length) writeQueue(readQueue().concat(pending))
        })
    }, 1500) // 等首屏请求发完，避免和首页接口抢并发
}

/** App 启动时调用一次：初始化会话、来源场景，并补发离线队列 */
export function initTracking() {
    if (!sessionId) sessionId = uuid()
    try {
        const options = uni.getLaunchOptionsSync ? uni.getLaunchOptionsSync() : null
        if (options) {
            scene = options.scene != null ? String(options.scene) : ''
            if (options.query) lastPath = options.path || ''
        }
    } catch (error) {
        // 拿不到场景就不带，不影响主流程
    }
    flushTrackingQueue()
}

/**
 * 进入页面：记录进入时间。
 * 由全局 mixin 在页面 onShow 时调用；tabBar 来回切时 onShow 会再次触发，
 * 这里先把上一段停留结算掉，避免同一页面被合并成一段超长时长。
 */
export function trackPageEnter() {
    if (!sessionId) initTracking()
    const path = getCurrentRoute()
    if (!path) return
    if (currentPage && currentPage.path === path) {
        currentPage.enterAt = Date.now()
        return
    }
    trackPageLeave()
    currentPage = {
        path,
        title: routeTitle(path) || path,
        enterAt: Date.now()
    }
}

/** 离开页面 / 页面卸载：结算停留时长并上报 */
export function trackPageLeave() {
    if (!currentPage) return
    const { path, title, enterAt } = currentPage
    currentPage = null
    const leaveTime = Date.now()
    const stayDuration = Math.max(0, leaveTime - enterAt)
    const fromPage = lastPath && lastPath !== path ? lastPath : ''
    lastPath = path
    report({
        sessionId,
        pagePath: path,
        pageTitle: title,
        fromPage,
        scene,
        enterTime: enterAt,
        leaveTime,
        stayDuration,
        appVersion: getAppVersion(),
        deviceInfo: JSON.stringify(getEnvInfo()),
        createTime: leaveTime
    })
}