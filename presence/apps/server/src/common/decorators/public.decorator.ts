import { SetMetadata } from '@nestjs/common'

/** 标记该路由为公开（无需 JWT 鉴权） */
export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
