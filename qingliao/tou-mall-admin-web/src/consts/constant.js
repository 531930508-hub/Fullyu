export default {
  shopStatus: [{value: 1, label: '正常'}, {value: 0, label: '已停用'},],
  shopRecommend: [{value: 1, label: '是'}, {value: 0, label: '否'},],
  shopStatusMap: {available: 1, notAvailable: 0},
  roomType: [{value: 1, label: '湿区'}, {value: 2, label: '干区'},],
  bedType: [{value: 1, label: '湿区'}, {value: 2, label: '干区'},],
  miniImageType: [{value: 1, label: '开屏图'}, {value: 3, label: '送券图'},{value: 2, label: '首页banner图'}, {value: 4, label: '子页banner图'}, {value: 5, label: '首页弹框图'}],
  jobStatus: [{value: 1, label: '在职'}, {value: 2, label: '暂挂'}, {value: 0, label: '离职'}],
  orderState: [
    {value: 0, label: '未付款'},
    {value: 1, label: '已付款未评价'},
    {value: 2, label: '已付款已评价'},
    {value: 3, label: '已关闭'},
    {value: 4, label: '已取消'},
    {value: 5, label: '退款中'},
    {value: 6, label: '已退款'},
    {value: 7, label: '退款审批中'},],
  refundState: [
    {value: -1, label: '失败'},
    {value: 0, label: '进行中'},
    {value: 1, label: '成功'},
  ],
  orderPayType: [
    {value: 3, label: '美团点评'},
    {value: 0, label: '二维码支付'},
    {value: 1, label: '小程序支付'},
    {value: 2, label: 'Full愈券'},
    {value: 4, label: '现金支付'}
  ],
  orderType: [
    {value: 0, label: '普通订单'},
    {value: 1, label: '卡券订单'}
  ],
  approvalState: [
    {label: '已拒绝', value: 0},
    {label: '待提交', value: 1},
    {label: '审批中', value: 2},
    {label: '已通过', value: 3},
    {label: '已撤回', value: 4},
    {label: '已跳过', value: 5},
  ],
  monthlyData: [
    {label: '1月', value: 1},
    {label: '2月', value: 2},
    {label: '3月', value: 3},
    {label: '4月', value: 4},
    {label: '5月', value: 5},
    {label: '6月', value: 6},
    {label: '7月', value: 7},
    {label: '8月', value: 8},
    {label: '9月', value: 9},
    {label: '10月', value:10},
    {label: '11月', value: 11},
    {label: '12月', value:12},
  ],
  // 审批状态map
  approvalStateMap: {
    rejected: 0,
    notSubmit: 1,
    approving: 2,
    passed: 3,
    withdraw: 4,
    skipped: 5,
  },
  // 审批人类型
  flowUserTypeMap: {
    create: 1,
    approval: 2,
    cc: 3,
  },
  //预约状态
  appointmentState: [
    {label: '未到店', value: 0},
    {label: '已到店', value: 1},
    {label: '已完成', value: 2},
    {label: '已取消', value: 3},
  ],
  //接待状态
  receptionState: [
    {label: '未开始', value: 0},
    {label: '已开始', value: 1},
    {label: '已完成', value: 2},
    {label: '已取消', value: 3},
  ],
  //预约状态
  orderAppointmentState: [
    {label: '未开始', value: 0},
    {label: '进行中', value: 1},
    {label: '已完成', value: 2},
    {label: '已取消', value: 3},
  ],
  //luxin新增订单取消状态
  ordercancelOrderType: [
    {label: '用户取消', value: 0},
    {label: '超时取消', value: 1},
    {label: '后台取消', value: 2},
  ],
  //预约类型
  appointmentType: [
    {label: 'Agent预约', value: 1},
    {label: '手动预约', value: 2},
    {label: '电话预约', value: 3},
    {label: 'AI电话预约', value: 4},
  ],
  customerCouponState: [
    {label: '已使用', value: 0},
    {label: '未使用', value: 1},
    {label: '已过期', value: 2},
    {label: '已赠送', value: 3},
    {label: '退款失效', value: 4},
    {label: '已回收', value: 5},
  ],
  couponUseType: [
    {label: '折扣券', value: 0},
    {label: '兑换券', value: 1},
    {label: '权益卡', value: 2},
  ],
  //审批code
  approvalCategory: [
    {label: '退款审批', value: 'refund'},
    {label: '送券审批', value: 'giftCoupon'},
    {label: '请假审批', value: 'askForLeave'},
    {label: '低星服务反馈', value: 'lowRating'},
  ],
  //调整时长状态
  adjustStatus: [
    {label: '已失效', value: 0},
    {label: '生效中', value: 1},
  ],
  //调整类型
  adjustType: [
    {label: '减少工时', value: 0},
    {label: '增加工时', value: 1},
  ],
  //收支类型
  revenueType: ['收入', '支出'],
  revenuePayState: ['未支付', '已支付'],//支付状态
  revenueBusinessType: ['购券预收', '核券收入', '微信支付', '二维码支付', '美团点评', '现金支付'],//流水类型
  revenueConsumptionState: ['已购券', '已预约未服务', '已预约服务中', '服务完成', '服务取消', '退款中', '已退款','仅退款'],//消费状态
  revenuePayType: ['二维码支付', '微信支付', '卡券支付', '美团点评', '现金支付', '汇付天下'],//收支渠道
  //产品类型
  productType: [
    {label: '项目', value: 0},
    {label: '卡券', value: 1},
  ],
  //产品状态/项目状态
  productState: [
    {label: '下架', value: 0},
    {label: '正常', value: 1},
  ],
  //项目属性
  projectType: [
    {label: '湿区', value: 1},
    {label: '干区', value: 2},
  ],
  //卡券状态
  couponState: [
    {label: '失效', value: 0},
    {label: '正常', value: 1},
  ],
  giftCardStatus: [
    {label: '已失效', value: 0},
    {label: '待发放', value: 1},
    {label: '待领取', value: 2},
    {label: '已领取', value: 3},
  ],
  giftCardType: [
    {label: '线下礼品卡', value: 1},
    {label: '商场礼品卡', value: 2},
  ],
  activityStatus: [
    {label: '已禁用', value: 0},
    {label: '启用中', value: 1},
  ],
  gender: [
    {label: '男', value: 1},
    {label: '女', value: 2},
  ],
  discountUseType: [
    {label: '新客折扣', value: '新客折扣'},
    {label: '通用折扣', value: '通用折扣'},
  ]
}
