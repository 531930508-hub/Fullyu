import constant from '../consts/constant'
import cookie from "../utils/cookieUtil";
import { t } from '../utils/locale'
import { storeName, storeAddress } from '../utils/storeLocale'

// 状态词表的 label 由 constant 里的 getter 取词，这里只需保证兜底文案也走词典
// 订单状态
export function orderStateFilter(value) {
    return (constant.orderStates.find(v => v.value == value) || {label: t('未设置')}).label
}

// 订单付款状态状态
export function orderPayTypeFilter(value) {
    return (constant.payType.find(v => v.value == value) || {label: t('未设置')}).label
}

// 门店名
export function shoreNameFilter(value) {
    if (!value) {
        return t('无')
    }
    const storeList = cookie.getStoreList()
    if (storeList && storeList.length) {
        // 门店名是业务数据：走门店自己的中英文列，后台没填英文时回退中文
        const shop = storeList.find(u => u.id == value)
        return shop ? storeName(shop) : t('无')
    }
    return t('无')
}

// 门店地址
export function shoreAddressFilter(value) {
    if (!value) {
        return t('无')
    }
    const storeList = cookie.getStoreList()
    if (storeList && storeList.length) {
        const shop = storeList.find(u => u.id == value)
        return shop ? storeAddress(shop) : t('无')
    }
    return t('无')
}

// 项目名
export function projectTitleFilter(projectId) {
    if (!projectId) return t('无')
    const projectList = cookie.getProjectList()
    if (!projectList?.length) return t('无')
    const projectMap = new Map()
    projectList
        .flatMap(item => item.projectList || [])
        .forEach(project => {
            if (!projectMap.has(project.id)) {
                projectMap.set(project.id, project.title)
            }
        })
    return t(projectMap.get(projectId)) || t('无')
}

// 礼物状态
export function giftStateFilter(value) {
    return (constant.giftState.find(v => v.value == value) || {label: t('未知状态')}).label
}

// 我的券状态
export function mineCouponStateFilter(value) {
    return (constant.mineCouponState.find(v => v.value == value) || {label: t('未知状态')}).label
}

// 预约状态
export function appointmentStateFilter(value) {
    return (constant.appointmentState.find(v => v.value == value) || {label: t('未设置')}).label
}

export default app => {
    app.config.globalProperties.$filters = {
        orderStateFilter,
        orderPayTypeFilter,
        shoreNameFilter,
        shoreAddressFilter,
        giftStateFilter,
        mineCouponStateFilter,
        appointmentStateFilter,
        projectTitleFilter
    }
}