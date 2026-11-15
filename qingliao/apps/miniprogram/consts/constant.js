import { t } from '../utils/locale'

/**
 * 状态词表的中文只作为词典 key 存在，label 交给 getter 在读取时取词。
 * 若在模块加载时就 t() 一遍，词表会固定在首次加载时的语言上；
 * getter 让 filters 每次渲染都取到当前语言，切换语言后列表即时更新。
 */
const withLocale = (rows) => rows.map(({label, value}) => ({
    value,
    get label() {
        return t(label)
    }
}))

const orderStates = withLocale([
    {label: '未付款', value: 0},
    {label: '已付款未评价', value: 1},
    {label: '已付款已评价', value: 2},
    {label: '已超时', value: 3},
    {label: '已取消', value: 4},
    {label: '退款中', value: 5},
    {label: '已退款', value: 6},
    {label: '退款审批中', value: 7},
])

const payType = withLocale([
    {label: '二维码支付', value: 0},
    {label: '微信Wechatpay', value: 1},
    {label: 'Full愈券', value: 2},
    {label: '美团点评', value: 3},
    {label: '现金支付', value: 4}
])

const giftState = withLocale([
    {label: '待赠送', value: -1},
    {label: '未领取', value: 0},
    {label: '已被领取', value: 1},
    {label: '已过期', value: 2},
    {label: '已取消赠送', value: 3}
])

const mineCouponState = withLocale([
    {label: "待赠送", value: -1},
    {label: "已使用", value: 0},
    {label: "可使用", value: 1},
    {label: "已过期", value: 2},
    {label: "已赠送", value: 3},
    {label: "退款失效", value: 4},
    {label: "回收", value: 5},
])

//预约状态
const appointmentState = withLocale([
    {label: '未开始', value: 0},
    {label: '进行中', value: 1},
    {label: '已完成', value: 2},
    {label: '已取消', value: 3},
])
// 支付倒计时
const payCutDownSeconds = 300
// 转发卡片图：放代码包内，避免网络图下载/解码失败导致卡片空白。要求 5:4、JPG/PNG、建议 <128KB
const shareCardImage = '/static/share/share-card.jpg'
export default {orderStates, payType, giftState, mineCouponState, payCutDownSeconds, appointmentState, shareCardImage}