/** 场地相关 API */
import { get } from '@/utils/request'

export interface VenueItem {
  id: string
  name: string
  city: string
  address?: string
  capacity?: number
  isAvailable?: boolean
}

/** 公开场地列表：首页按城市筛选后只展示当前城市场地 */
export function listVenues() {
  return get<VenueItem[]>('/venues', undefined, { auth: false, silent: true })
}
