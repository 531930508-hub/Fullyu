import request from '@/utils/request'

// 合并支付台账（预约单 + 会员卡续费一次收款）分页
export function fetchPayGroupPage(params) {
  return request({
    url: '/payGroup/admin/page',
    method: 'get',
    params: params
  })
}

// 财务手工确认门店分账完成
export function confirmPayGroupSplit(data) {
  return request({
    url: '/payGroup/admin/split/confirm',
    method: 'post',
    data: data
  })
}