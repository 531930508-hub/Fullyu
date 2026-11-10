/**
 * 会员码二维码：一张码只能打开一个小程序的会员页。
 * 小程序码必须由服务端调用微信 getwxacodeunlimit 生成，普通链接二维码只会打开浏览器。
 * appid 是公开信息；secret 只从部署环境读取，不写库、不进日志、不返回前端。
 */
export type GiftAppTarget = 'sx' | 'zc' | 'ql';

export interface GiftAppConfig {
  name: string;
  appid: string;
  page: string;
  secretEnv: string;
  sceneEnv: string;
}

export const GIFT_APP_TARGETS: Record<GiftAppTarget, GiftAppConfig> = {
  sx: {
    name: '时叙',
    appid: 'wxd9e4e4568d1bc8bb',
    page: 'pages/brand-member/index',
    secretEnv: 'WX_SECRET_SX',
    sceneEnv: 'WX_QR_ENV_SX'
  },
  zc: {
    name: '在场',
    appid: 'wxa7572dea26f5f4e4',
    page: 'pages/brand-member/index',
    secretEnv: 'WX_SECRET_ZC',
    sceneEnv: 'WX_QR_ENV_ZC'
  },
  ql: {
    name: '轻疗',
    appid: 'wxeb4e8a99b7eeebf8',
    page: 'pages/user/brand-member/brand-member',
    secretEnv: 'WX_SECRET_QL',
    sceneEnv: 'WX_QR_ENV_QL'
  }
};

export type QrEnvVersion = 'release' | 'trial' | 'develop';

/** 未指定或历史数据为空时默认时叙；非法值直接报错，避免把码打到错误的小程序。 */
export function normalizeAppTarget(value: unknown): GiftAppTarget {
  if (value === undefined || value === null || value === '') return 'sx';
  const target = String(value).trim().toLowerCase();
  if (target === 'sx' || target === 'zc' || target === 'ql') return target;
  throw new Error('GIFT_APP_TARGET_INVALID');
}

export function qrEnvVersion(value: unknown, fallback: string | undefined): QrEnvVersion {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'release' || raw === 'trial' || raw === 'develop') return raw;
  const configured = String(fallback ?? '').trim().toLowerCase();
  if (configured === 'release' || configured === 'trial' || configured === 'develop') {
    return configured;
  }
  return 'trial';
}

/** scene 最长 32 字节；会员码 4–16 位，`g=` 前缀后仍然安全。 */
export function giftScene(code: string): string {
  const scene = `g=${String(code || '').trim().toUpperCase()}`;
  if (Buffer.byteLength(scene, 'utf8') > 32) throw new Error('GIFT_SCENE_TOO_LONG');
  return scene;
}

export const GIFT_APP_LABEL: Record<GiftAppTarget, string> = {
  sx: '时叙',
  zc: '在场',
  ql: '轻疗'
};
