import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import OSS from 'ali-oss'
import { BusinessException } from '../exceptions/business.exception'

/**
 * 阿里云 OSS 存储服务：
 * - 服务端代传（putBuffer）
 * - 生成私有对象的临时签名访问 URL（signedUrl）
 * - 生成前端直传的 PostObject 表单签名（directUploadPolicy）
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger('StorageService')
  private _client?: OSS

  constructor(private readonly config: ConfigService) {}

  private get region() {
    return this.config.get<string>('OSS_REGION', 'oss-cn-shanghai')
  }
  private get bucket() {
    return this.config.get<string>('OSS_BUCKET', '')
  }
  private get accessKeyId() {
    return this.config.get<string>('OSS_ACCESS_KEY_ID', '')
  }
  private get accessKeySecret() {
    return this.config.get<string>('OSS_ACCESS_KEY_SECRET', '')
  }
  /** 自定义/CDN 加速域名（可选） */
  private get cdnHost() {
    return this.config.get<string>('OSS_CDN_HOST', '')
  }

  private get client(): OSS {
    if (!this._client) {
      if (!this.bucket || !this.accessKeyId) {
        throw new BusinessException('OSS 未配置', 5010)
      }
      this._client = new OSS({
        region: this.region,
        accessKeyId: this.accessKeyId,
        accessKeySecret: this.accessKeySecret,
        bucket: this.bucket,
        secure: true,
      })
    }
    return this._client
  }

  /** 生成带日期前缀的对象 key */
  buildObjectKey(dir: string, filename: string): string {
    const ext = filename.includes('.') ? filename.split('.').pop() : ''
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
    const rand = crypto.randomBytes(8).toString('hex')
    return `${dir.replace(/^\/+|\/+$/g, '')}/${date}/${rand}${ext ? '.' + ext : ''}`
  }

  /** 服务端代传：返回对象 key */
  async putBuffer(key: string, buffer: Buffer, mime?: string): Promise<string> {
    try {
      await this.client.put(key, buffer, {
        mime,
        headers: { 'x-oss-object-acl': 'private' },
      })
      return key
    } catch (e) {
      this.logger.error(`OSS 上传失败: ${(e as Error).message}`)
      throw new BusinessException('文件上传失败', 5011)
    }
  }

  /** 生成私有对象的临时签名访问 URL（默认 1 小时） */
  signedUrl(key: string, expiresSeconds = 3600): string {
    if (this.cdnHost) {
      // CDN 场景通常配置回源鉴权，这里退化为直接拼域名
      return `${this.cdnHost.replace(/\/+$/, '')}/${key}`
    }
    return this.client.signatureUrl(key, { expires: expiresSeconds })
  }

  /**
   * 生成前端直传签名（PostObject）。前端将 policy/signature/OSSAccessKeyId/key
   * 拼入 FormData 直传到 OSS host，减轻服务端带宽压力。
   */
  directUploadPolicy(dir: string, filename: string, maxSizeMB = 10) {
    const key = this.buildObjectKey(dir, filename)
    const expiration = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const policyText = JSON.stringify({
      expiration,
      conditions: [
        ['content-length-range', 0, maxSizeMB * 1024 * 1024],
        ['starts-with', '$key', dir.replace(/^\/+|\/+$/g, '')],
      ],
    })
    const policy = Buffer.from(policyText).toString('base64')
    const signature = crypto
      .createHmac('sha1', this.accessKeySecret)
      .update(policy)
      .digest('base64')
    const host = this.cdnHost || `https://${this.bucket}.${this.region}.aliyuncs.com`
    return {
      host,
      key,
      policy,
      signature,
      OSSAccessKeyId: this.accessKeyId,
      expire: Math.floor((Date.now() + 5 * 60 * 1000) / 1000),
    }
  }
}
