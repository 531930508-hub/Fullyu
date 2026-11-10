import constant from "@/consts/constant";
import store from "@/store";
import dateUtil from "@/utils/dateUtil";

export function shopStatusFilter(value) {
  const shopStatusList = constant.shopStatus
  if (shopStatusList && shopStatusList.length) {
    return (shopStatusList.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function shopRecommendFilter(value) {
  const shopRecommendList = constant.shopRecommend
  if (shopRecommendList && shopRecommendList.length) {
    return (shopRecommendList.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function roomTypeFilter(value) {
  const list = constant.roomType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function miniImageTypeFilter(value) {
  const list = constant.miniImageType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function formatMMDD(dateStr) {
  if (dateStr) {
    return dateUtil.format(dateStr, 'MM-DD', 'YYYY-MM-DD');
  }
  return ''
}


export function bedTypeFilter(value) {
  const list = constant.bedType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function jobStatusFilter(value) {
  const list = constant.jobStatus
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function shopNameFilter(value) {
  const shopList = store.getters.shopListAll
  if (shopList && shopList.length) {
    return (shopList.find(u => u.id == value) || {name: '-'}).name
  }
  return '无'
}

export function roomNameFilter(value) {
  const shopList = store.getters.roomList
  if (shopList && shopList.length) {
    return (shopList.find(u => u.id == value) || {name: '未设置'}).name
  }
  return '无'
}

export function adminUsernameFilter(value) {
  const list = store.getters.adminUserList
  if (list && list.length) {
    return (list.find(u => u.id == value) || {nickName: '未设置'}).nickName
  }
  return '无'
}

export function massagistNameFilter(value) {
  const list = store.getters.massagistList
  if (list && list.length) {
    return (list.find(u => u.id == value) || {name: '未设置'}).name
  }
  return '无'
}

export function approvalStateFilter(value) {
  const list = constant.approvalState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function orderStateFilter(value) {
  const list = constant.orderState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function refundStateFilter(value) {
  const list = constant.refundState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '未设置'}).label
  }
  return '无'
}

export function orderPayTypeFilter(value) {
  const list = constant.orderPayType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function appointmentStateFilter(value) {
  const list = constant.appointmentState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function receptionStateFilter(value) {
  const list = constant.receptionState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function orderAppointmentStateFilter(value) {
  const list = constant.orderAppointmentState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}
//luxin新增
export function ordercancelOrderTypeFilter(value) {
  const list = constant.ordercancelOrderType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: ''}).label
  }
  return '无'
}

export function appointmentTypeFilter(value) {
  const list = constant.appointmentType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

//客户优惠券使用状态
export function customerCouponStateFilter(value) {
  const list = constant.customerCouponState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

//客户优惠券使用类型
export function couponUseTypeFilter(value) {
  const list = constant.couponUseType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

//调整时长状态
export function adjustStatusFilter(value) {
  const list = constant.adjustStatus
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

//调整时长类型
export function adjustTypeFilter(value) {
  const list = constant.adjustType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function productTypeFilter(value) {
  const list = constant.productType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function productStateFilter(value) {
  const list = constant.productState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function projectTypeFilter(value) {
  const list = constant.projectType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function couponStateFilter(value) {
  const list = constant.couponState
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function giftCardStatusFilter(value) {
  const list = constant.giftCardStatus
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function giftCardTypeFilter(value) {
  const list = constant.giftCardType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function activityStatusFilter(value) {
  const list = constant.activityStatus
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function discountUseTypeFilter(value) {
  const list = constant.discountUseType
  if (list && list.length) {
    return (list.find(u => u.value == value) || {label: '无'}).label
  }
  return '无'
}

export function activityFilter(value) {
  const list = store.getters.activityDoingList
  if (list && list.length) {
    return (list.find(u => u.id == value) || {title: '无'}).title
  }
  return '无'
}

//疗愈师技能
export function massagistproject(value) {
  const list = store.getters.projectList
  let str = ""
  if (value!=null&&value!= '') {
    let arr = JSON.parse(value)
    Object.values(arr).forEach(item => {
      str += (list.find(u => u.id == item) || {title: '无'}).title + " "
    });
  }
  return str
}



