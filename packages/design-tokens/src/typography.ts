/**
 * Full愈 字体排版规范 (FullYu Typography System v1.0)
 *
 * 品牌字体: FullYu Healing Font (精致衬线体)
 * 代码字体: SF Mono, Consolas, Menlo, monospace
 */

/** 字体家族 */
export const fontFamily = {
  /** 品牌字体 - 用于标题和正文 */
  brand: '"FullYu Healing Font", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  /** 代码字体 */
  code: '"SF Mono", Consolas, Menlo, monospace',
} as const

/** 字重 */
export const fontWeight = {
  regular: 400,   // 正文内容
  medium: 500,    // 标签、强调
  bold: 700,      // 标题、重点强调
} as const

/** 字号体系 (px) */
export const fontSize = {
  h1: 48,         // 页面标题
  h2: 32,         // 章节标题
  h3: 24,         // 子标题
  body: 16,       // 正文
  caption: 14,    // 说明文字、标签
  small: 12,      // 脚注、小字
} as const

/** 行高 */
export const lineHeight = {
  h1: 1.2,
  h2: 1.25,
  h3: 1.3,
  body: 1.7,
  caption: 1.6,
  small: 1.5,
} as const

/** 字间距 */
export const letterSpacing = {
  h1: '-0.01em',   // -1%
  h2: '-0.005em',  // -0.5%
  h3: '0',
  body: '0',
  caption: '0',
  small: '0',
} as const

/** 小程序字号适配 (rpx) */
export const fontSizeRpx = {
  h1: 96,
  h2: 64,
  h3: 48,
  body: 32,
  caption: 28,
  small: 24,
} as const

/** 预组合排版样式 */
export const typography = {
  h1: {
    fontSize: fontSize.h1,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.h1,
    letterSpacing: letterSpacing.h1,
  },
  h2: {
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.h2,
    letterSpacing: letterSpacing.h2,
  },
  h3: {
    fontSize: fontSize.h3,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.h3,
    letterSpacing: letterSpacing.h3,
  },
  body: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.body,
    letterSpacing: letterSpacing.body,
  },
  caption: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.caption,
    letterSpacing: letterSpacing.caption,
  },
  small: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.small,
    letterSpacing: letterSpacing.small,
  },
} as const
