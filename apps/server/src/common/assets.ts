import { join } from 'node:path';

/** 请求体上限：头像走 base64 直传，需覆盖 2MB 图片编码后的体积。 */
export const BODY_LIMIT = '6mb';

/** 上传目录：相对后端进程工作目录（apps/server），由 main.ts 静态托管。 */
export const UPLOAD_ROOT = process.env.UPLOAD_ROOT || join(process.cwd(), 'uploads');
export const UPLOAD_URL_PREFIX = '/uploads';

/** 对外可访问的资源根地址，部署时用 ASSET_BASE_URL 指向 CDN 或对象存储。 */
export const assetBaseUrl = (): string =>
  (process.env.ASSET_BASE_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/+$/, '');

export const assetUrl = (key: string): string => `${assetBaseUrl()}${UPLOAD_URL_PREFIX}/${key.replace(/^\/+/, '')}`;
