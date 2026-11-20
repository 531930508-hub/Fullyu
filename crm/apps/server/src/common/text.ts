import { badRequest } from './errors';

/**
 * 文本字段的统一护栏：
 * - 控制字符（C0/C1，含 NUL、换行、制表符）一律拒绝——业务端昵称/姓名里混进来会污染
 *   CRM 档案、后台列表与导出，MySQL 严格模式下还会让整条同步失败在数据库层；
 * - 审计明细等长文本入库前统一截断，避免超过 MySQL 列宽。
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
const CONTROL_CHARS_GLOBAL = /[\u0000-\u001F\u007F-\u009F]/g;

export function assertNoControlChars(value: string, label: string): void {
  if (CONTROL_CHARS.test(value)) throw badRequest(`${label}包含非法控制字符`);
}

/**
 * 同步链路（业务端每次登录都会带昵称）不硬失败：把控制字符剔掉再入库。
 * 历史脏昵称不能把登录卡死，人工编辑走 assertNoControlChars 明确报错。
 */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS_GLOBAL, '').trim();
}

/** 按字符（不是 UTF-16 码元）截断，避免切坏 emoji。 */
export function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}