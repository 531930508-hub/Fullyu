import constant from '../consts/constant'
import cookie from "../utils/cookieUtil";

// 订单状态
export function orderStateFilter(value) {
    return (constant.orderStates.find(v => v.value == value) || {label: '未设置'}).label
}

// 订单付款状态状态
export function orderPayTypeFilter(value) {
    return (constant.payType.find(v => v.value == value) || {label: '未设置'}).label
}

// 门店名
export function shoreNameFilter(value) {
    if (!value) {
        return '无'
    }
    const storeList = cookie.getStoreList()
    if (storeList && storeList.length) {
        return (storeList.find(u => u.id == value) || {name: '无'}).name
    }
    return '无'
}

// 门店地址
export function shoreAddressFilter(value) {
    if (!value) {
        return '无'
    }
    const storeList = cookie.getStoreList()
    if (storeList && storeList.length) {
        return (storeList.find(u => u.id == value) || {address: '无'}).address
    }
    return '无'
}

// 项目名
export function projectTitleFilter(projectId) {
    if (!projectId) return '无'
    const projectList = cookie.getProjectList()
    if (!projectList?.length) return '无'
    const projectMap = new Map()
    projectList
        .flatMap(item => item.projectList || [])
        .forEach(project => {
            if (!projectMap.has(project.id)) {
                projectMap.set(project.id, project.title)
            }
        })
    return projectMap.get(projectId) || '无'
}

// 礼物状态
export function giftStateFilter(value) {
    return (constant.giftState.find(v => v.value == value) || {label: '未知状态'}).label
}

// 我的券状态
export function mineCouponStateFilter(value) {
    return (constant.mineCouponState.find(v => v.value == value) || {label: '未知状态'}).label
}

// 预约状态
export function appointmentStateFilter(value) {
    return (constant.appointmentState.find(v => v.value == value) || {label: '未设置'}).label
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
