/**
 * 角色的中文显示名。
 *
 * roles.name 存的是 STORE_MANAGER 这类稳定标识，中文名由 seed 写在
 * description 的「· 」之前（如「分公司负责人 · 本公司及下属门店……」）。
 * 这里取前半段给人看；自建角色没有这个前缀，就原样用标识，不隐藏信息。
 */
export function roleLabel(role?: { name?: string | null; description?: string | null } | null): string {
  if (!role) return '\u2014'
  const head = (role.description || '').split(' \u00b7 ')[0].trim()
  return head || role.name || '\u2014'
}

/** 角色描述里去掉中文名前缀后的正文，避免和 roleLabel 重复显示 */
export function roleDesc(role?: { name?: string | null; description?: string | null } | null): string {
  const d = (role?.description || '').trim()
  if (!d) return ''
  const i = d.indexOf(' \u00b7 ')
  return i >= 0 ? d.slice(i + 3).trim() : d
}
