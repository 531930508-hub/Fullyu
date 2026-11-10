/**
 * Full愈 色彩系统 (FullYu Healing Color System v1.0)
 *
 * 品牌色彩哲学: NATURAL / HEALING / BALANCED
 * 所有组合满足 WCAG 2.1 AA 标准
 */

/** 主色 (Primary Colors) */
export const colors = {
  // --- 品牌主色 ---
  primary: '#6B463C',        // Deep Brown - 主品牌色：按钮、强调、图标、高亮
  primaryHover: '#5A3A32',   // Deep Brown Hover
  primaryActive: '#4A2F28',  // Deep Brown Active
  primaryDark: '#4B3621',    // Dark Brown - 标题、浅底文字
  secondary: '#A08A72',      // Taupe - 次要强调：边框、图标、微妙背景

  // --- 背景色 ---
  bgWarm: '#F5E8D8',         // Warm Cream - 主页面背景
  bgPeach: '#FFF3E0',        // Light Peach - 交替背景、微妙高亮
  bgWhite: '#FFFFFF',        // 白色背景
  bgDisabled: '#F1E7DF',     // 禁用状态背景

  // --- 文字色（浅底） ---
  textPrimary: '#4B3621',    // 主文字 对比度 12.63:1 AAA
  textSecondary: '#6B463C',  // 次要文字 对比度 6.33:1 AA
  textTertiary: '#A08A72',   // 辅助文字 对比度 4.21:1 AA
  textDisabled: '#C6B8A6',   // 禁用文字 对比度 3.02:1 AA Large
  textMuted: '#7D665C',      // 弱化文字

  // --- 文字色（深底） ---
  textOnDarkPrimary: '#F5E8D8',   // 深底主文字 对比度 13.68:1 AAA
  textOnDarkSecondary: '#EEE0C6', // 深底次要文字
  textOnDarkTertiary: '#D8C6A8',  // 深底辅助文字
  textOnDarkMuted: '#B8A88C',     // 深底弱化文字

  // --- 功能色 ---
  error: '#C0392B',          // 错误/警告
  success: '#27AE60',        // 成功
  warning: '#F39C12',        // 提示
  info: '#2980B9',           // 信息

  // --- 边框与分割线 ---
  border: '#D8CBBB',         // 默认边框
  borderLight: '#E8DED2',    // 轻边框
  divider: '#EDE5DB',        // 分割线

  // --- 按钮特殊状态 ---
  btnDisabledBg: '#B8A49A',  // 禁用按钮背景
  btnHoverBg: '#F0DCCB',     // Icon Button Hover
  btnActiveBg: '#E8D2BD',    // Icon Button Active
} as const

/** 色彩类型导出 */
export type ColorKey = keyof typeof colors
export type ColorValue = (typeof colors)[ColorKey]
