import { get, post, put, del } from './request'

/** 场地列表 */
export function listVenues() {
  return get('/venues')
}

/** 场地详情 */
export function getVenue(id: string) {
  return get(`/venues/${id}`)
}

/** 创建场地 */
export function createVenue(body: any) {
  return post('/venues', body)
}

/** 更新场地 */
export function updateVenue(id: string, body: any) {
  return put(`/venues/${id}`, body)
}

/** 删除场地 */
export function removeVenue(id: string) {
  return del(`/venues/${id}`)
}

/** 场地预约列表 */
export function listReservations(params?: { venueId?: string; date?: string }) {
  return get('/venues/reservations', params)
}

/** 创建场地预约 */
export function createReservation(body: any) {
  return post('/venues/reservations', body)
}

/** 删除场地预约 */
export function removeReservation(id: string) {
  return del(`/venues/reservations/${id}`)
}
