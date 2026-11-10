const orderStates = [
    {label: '未付款', value: 0},
    {label: '已付款未评价', value: 1},
    {label: '已付款已评价', value: 2},
    {label: '已超时', value: 3},
    {label: '已取消', value: 4},
    {label: '退款中', value: 5},
    {label: '已退款', value: 6},
    {label: '退款审批中', value: 7},
]

const payType = [
    {label: '二维码支付', value: 0},
    {label: '微信Wechatpay', value: 1},
    {label: 'Full愈券', value: 2},
    {label: '美团点评', value: 3},
    {label: '现金支付', value: 4}
]

const giftState = [
    {label: '待赠送', value: -1},
    {label: '未领取', value: 0},
    {label: '已被领取', value: 1},
    {label: '已过期', value: 2},
    {label: '已取消', value: 3}
]

const mineCouponState = [
    {label: "待赠送", value: -1},
    {label: "已使用", value: 0},
    {label: "可使用", value: 1},
    {label: "已过期", value: 2},
    {label: "已赠送", value: 3},
    {label: "退款失效", value: 4},
    {label: "回收", value: 5},
]

//预约状态
const appointmentState = [
    {label: '未开始', value: 0},
    {label: '进行中', value: 1},
    {label: '已完成', value: 2},
    {label: '已取消', value: 3},
]
// 支付倒计时
const payCutDownSeconds = 120
export default {orderStates, payType, giftState, mineCouponState, payCutDownSeconds, appointmentState}
