import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { StorageService } from '../storage/storage.service'

/**
 * 统一把响应里的图片引用转成可访问地址。
 *
 * 数据库只保存 OSS 对象 key，读接口按需签名；历史数据仍是 base64 时原样返回，
 * 因此兼容迁移前后的数据。仅处理已知图片字段，避免误改业务文本或外链。
 */
const IMAGE_FIELDS = new Set([
  'avatar',
  'photo',
  'coverImage',
  'gallery',
  'images',
  'image',
  'imageUrl',
  'coverUrl',
  'ownerAvatar',
  'authorAvatar',
  'cover',
  'contractUrl',
])

const ARRAY_JSON_FIELDS = new Set(['gallery', 'images'])

/** 列表/详情展示足够清晰，同时显著降低首屏图片体积；个人照片与合同保持原图。 */
const IMAGE_PROCESS: Record<string, string> = {
  avatar: 'image/resize,w_200/quality,q_80',
  ownerAvatar: 'image/resize,w_200/quality,q_80',
  authorAvatar: 'image/resize,w_200/quality,q_80',
  coverImage: 'image/resize,w_1080/quality,q_82',
  cover: 'image/resize,w_1080/quality,q_82',
  coverUrl: 'image/resize,w_1080/quality,q_82',
  gallery: 'image/resize,w_1200/quality,q_85',
  images: 'image/resize,w_1200/quality,q_85',
  image: 'image/resize,w_1200/quality,q_85',
  imageUrl: 'image/resize,w_1200/quality,q_85',
}

@Injectable()
export class ImageUrlInterceptor implements NestInterceptor {
  constructor(private readonly storage: StorageService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.hydrate(data)))
  }

  private hydrate(value: any, depth = 0): any {
    if (depth > 12 || value === null || value === undefined) return value
    if (Array.isArray(value)) {
      return value.map((item) => this.hydrate(item, depth + 1))
    }
    if (typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
      return value
    }
    // 只遍历普通对象；Prisma Decimal 等类实例保留原型，交给 JSON 序列化处理。
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return value

    let changed = false
    const output: Record<string, any> = {}
    for (const [key, item] of Object.entries(value)) {
      let next = item
      if (IMAGE_FIELDS.has(key)) {
        next = this.resolveField(key, item, depth)
      } else if (item && typeof item === 'object') {
        next = this.hydrate(item, depth + 1)
      }
      if (next !== item) changed = true
      output[key] = next
    }
    return changed ? output : value
  }

  private resolveField(key: string, value: any, depth: number): any {
    const process = IMAGE_PROCESS[key]
    if (typeof value === 'string') {
      if (ARRAY_JSON_FIELDS.has(key) && /^\s*\[/.test(value)) {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) {
            return JSON.stringify(parsed.map((item) => this.storage.resolveImageRef(item, undefined, process)))
          }
        } catch {
          return value
        }
      }
      return this.storage.resolveImageRef(value, undefined, process)
    }
    if (Array.isArray(value)) {
      return value.map((item) =>
        typeof item === 'string'
          ? this.storage.resolveImageRef(item, undefined, process)
          : this.hydrate(item, depth + 1),
      )
    }
    return value
  }
}
