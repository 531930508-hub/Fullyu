import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AvatarStorageProvider, AvatarUploadRequest, AvatarUploadResult } from '../../contracts';

const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png'
};

export type LocalAvatarOptions = {
  root: string;
  assetUrl: (key: string) => string;
};

/**
 * 本地磁盘头像存储（内置实现，不是模拟）。
 * 真实部署替换为对象存储（OSS/COS）：put 改为服务端上传或签名直传，resolve 改为签名访问地址。
 */
export class LocalAvatarStorage implements AvatarStorageProvider {
  readonly name = 'local-disk';
  readonly mode = 'local';
  private readonly root: string;
  private readonly assetUrl: (key: string) => string;

  constructor(options: LocalAvatarOptions) {
    this.root = options.root;
    this.assetUrl = options.assetUrl;
  }

  async put(request: AvatarUploadRequest): Promise<AvatarUploadResult> {
    const ext = AVATAR_EXTENSIONS[request.contentType.toLowerCase()];
    if (!ext) throw new Error('仅支持 JPG 或 PNG 头像');
    const buffer = Buffer.from(request.base64, 'base64');
    if (!buffer.length) throw new Error('头像内容为空');
    if (buffer.length > 2 * 1024 * 1024) throw new Error('头像不能超过 2MB');
    const dir = join(this.root, 'avatars');
    mkdirSync(dir, { recursive: true });
    const key = `avatars/${request.customerId}-${randomBytes(6).toString('hex')}.${ext}`;
    writeFileSync(join(this.root, key), buffer);
    return { key, url: this.assetUrl(key) };
  }

  resolve(key: string | null | undefined): string | null {
    if (!key) return null;
    if (/^https?:\/\//i.test(key)) return key;
    return this.assetUrl(key);
  }
}
