/**
 * USB 固定式二维扫码器的按键解析。
 *
 * 扫码器按键盘模式工作：逐字符输入条码内容，末尾追加回车。
 * 营业台开启「扫码枪常驻」后，光标不在输入框时由这里接管，
 * 避免每一杯都要先点一下输入框。
 */
export type GunKey = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

export type GunTarget = {
  tagName?: string;
  isContentEditable?: boolean;
} | null;

/** 输入框、下拉框和可编辑区域里的按键属于用户在操作，不能被扫码枪抢走。 */
export function isEditableScanTarget(target: GunTarget): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes((target.tagName || '').toUpperCase());
}

/**
 * 一次按键的归类：
 * - append：可计入扫码缓冲的字母 / 数字 / 横线；
 * - submit：回车，把缓冲提交为一次扫码；
 * - ignore：组合键、输入框内或其它按键。
 */
export function classifyScanGunKey(event: GunKey, target: GunTarget): 'append' | 'submit' | 'ignore' {
  if (event.ctrlKey || event.metaKey || event.altKey) return 'ignore';
  if (isEditableScanTarget(target)) return 'ignore';
  if (event.key === 'Enter') return 'submit';
  return /^[A-Za-z0-9-]$/.test(event.key) ? 'append' : 'ignore';
}

/** 缓冲只保留杯号字符并统一大写；扫码器偶尔会夹杂空白或换行。 */
export function normalizeGunCode(buffer: string): string {
  return String(buffer || '')
    .replace(/[^A-Za-z0-9-]/g, '')
    .trim()
    .toUpperCase();
}

/** 少于 3 位的多半是误触键盘，不当作扫码提交。 */
export function isPlausibleGunCode(code: string): boolean {
  return normalizeGunCode(code).length >= 3;
}
