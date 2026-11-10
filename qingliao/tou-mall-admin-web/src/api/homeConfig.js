import request from '@/utils/request'

// 当前账号的首页方案：{ superAdmin, roles, config }
export function fetchMine() {
  return request({
    url: '/homeConfig/mine',
    method: 'get'
  })
}

// 全部角色 + 已保存方案（仅超级管理员）
export function fetchConfigList() {
  return request({
    url: '/homeConfig/list',
    method: 'get'
  })
}

export function saveConfig(data) {
  return request({
    url: '/homeConfig/save',
    method: 'post',
    data: data
  })
}

export function resetConfig(roleId) {
  return request({
    url: '/homeConfig/reset',
    method: 'post',
    data: { roleId }
  })
}