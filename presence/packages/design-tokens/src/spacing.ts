/**
 * Full愈 间距与圆角规范 (FullYu Spacing & Radius System)
 */

/** 间距体系 (px) */
export const spacing = {
  xs: 4,       // Extra Small - 最小间距
  sm: 8,       // Small - 小间距
  base: 12,    // Base - 基础间距
  md: 16,      // Medium - 中等间距
  lg: 20,      // Large - 大间距
  xl: 24,      // Extra Large - 超大间距
  xxl: 32,     // Extra Extra Large - 最大间距
} as const

/** 间距 rpx (小程序适配，px * 2) */
export const spacingRpx = {
  xs: 8,
  sm: 16,
  base: 24,
  md: 32,
  lg: 40,
  xl: 48,
  xxl: 64,
} as const

/** 圆角体系 (px) */
export const radius = {
  sm: 8,       // 小圆角 - 按钮、输入框、徽章、标签
  md: 12,      // 中圆角 - 卡片、弹窗、下拉框
  lg: 16,      // 大圆角 - 大容器、Hero区域
  full: 9999,  // 全圆角 - 头像、圆形按钮
} as const

/** 阴影体系 */
export const shadow = {
  /** 柔和阴影 - 卡片默认状态 */
  soft: '0px 2px 4px rgba(107, 70, 60, 0.08)',
  /** 聚焦阴影 - 输入框 Focus 状态 */
  focus: '0px 0px 3px rgba(107, 70, 60, 0.15)',
  /** 悬浮阴影 - 卡片 Hover 状态 */
  elevated: '0px 4px 8px rgba(107, 70, 60, 0.12)',
  /** 弹窗阴影 */
  modal: '0px 8px 24px rgba(107, 70, 60, 0.16)',
} as const

/** 组件尺寸 */
export const size = {
  /** 按钮高度 */
  btnHeight: 40,
  /** 输入框高度 */
  inputHeight: 40,
  /** 按钮水平内边距 */
  btnPaddingX: 16,
  /** 输入框水平内边距 */
  inputPaddingX: 12,
  /** Icon Button 尺寸 */
  iconBtnSize: 40,
  /** Textarea 最小高度 */
  textareaMinHeight: 100,
  /** 底部 Tab 栏高度 */
  tabBarHeight: 56,
  /** 顶部导航栏高度 */
  navBarHeight: 44,
} as const

/** 边框 */
export const border = {
  /** 默认边框 */
  default: '1px solid #D8CBBB',
  /** 聚焦边框 */
  focus: '1px solid #6B463C',
  /** 错误边框 */
  error: '1px solid #C0392B',
  /** 轻边框 */
  light: '1px solid #E8DED2',
} as const
