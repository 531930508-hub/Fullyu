import http from '../utils/fetch'

/**
 * 合并支付（预约单 + 会员卡续费）一笔收款，服务端按台账拆单结算。
 */
export default {
    // 创建合并支付单：orderId 必填，renewYear=true 时同时续会员卡；返回 payNo / payParams / testMode
    create(data) {
        return http.post({
            url: '/payGroup/create',
            data: data
        })
    },
    // 轮询合并支付状态：state 0待支付 1已支付 2已关闭 3重复收款待人工退款
    state(payNo) {
        return http.get({
            url: '/payGroup/state',
            params: {payNo}
        })
    },
    // 测试环境模拟支付（服务端要求 body 传 payNo）
    mockPay(payNo) {
        return http.post({
            url: '/payGroup/mockPay',
            data: {payNo}
        })
    }
}