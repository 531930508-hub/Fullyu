import { SetMetadata } from '@nestjs/common'

/** 标记该路由跳过统一响应包装（用于支付回调等需要原始响应的端点） */
export const SKIP_TRANSFORM_KEY = 'skipTransform'
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true)
