import { get, post, put } from './request'

// ===== 会员卡商品 =====

/** 会员卡商品列表（全部状态） */
export function adminListProducts() {
  return get('/member-admin/products')
}

/** 创建会员卡商品 */
export function createProduct(body: any) {
  return post('/member-admin/products', body)
}

/** 更新会员卡商品 */
export function updateProduct(id: string, body: any) {
  return put(`/member-admin/products/${id}`, body)
}

/** 上架/下架会员卡商品 */
export function setProductStatus(id: string, status: 'ON_SHELF' | 'OFF_SHELF') {
  return post(`/member-admin/products/${id}/status`, { status })
}

// ===== 会员卡实例 =====

/** 会员卡列表（后台） */
export function adminListCards(params?: { userId?: string; status?: string }) {
  return get('/member-admin/cards', params)
}

/** 冻结会员卡 */
export function freezeCard(id: string) {
  return post(`/member-admin/cards/${id}/freeze`)
}

/** 解冻会员卡 */
export function unfreezeCard(id: string) {
  return post(`/member-admin/cards/${id}/unfreeze`)
}
