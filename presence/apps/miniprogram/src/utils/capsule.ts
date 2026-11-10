/**
 * 微信胶囊（右上角 ··· / 关闭）布局计算。
 * 自定义导航页统一让标题与操作落在胶囊下方，避免右侧按钮被胶囊遮挡。
 */

export interface CapsuleMenuRect {
  top?: number
  bottom?: number
  left?: number
  height?: number
}

export interface CapsuleMetrics {
  statusBarHeight?: number
  windowWidth?: number
  menu?: CapsuleMenuRect | null
}

export interface CapsuleLayout {
  /** 状态栏高度（px），用于页面顶部占位 */
  statusBarHeight: number
  /** 状态栏以下、胶囊以下的留白（px），用于自定义导航栏的 padding-top */
  headerTop: number
  /** 右侧操作需要让出的宽度（px），保留给需要在胶囊同一行展示的操作 */
  capsuleRight: number
  /** 胶囊行高（px），无胶囊时回退 44 */
  navBarHeight: number
  /** 当前环境是否存在微信胶囊 */
  hasCapsule: boolean
}

export function capsuleLayoutFrom(metrics: CapsuleMetrics = {}): CapsuleLayout {
  const statusBarHeight = Math.max(0, Number(metrics.statusBarHeight) || 0)
  const windowWidth = Math.max(0, Number(metrics.windowWidth) || 0)
  const menu = metrics.menu || {}
  const menuTop = Number(menu.top) || 0
  const menuBottom = Number(menu.bottom) || 0
  const menuLeft = Number(menu.left) || 0
  const menuHeight = Number(menu.height) || 0
  const hasCapsule = menuBottom > 0 && menuHeight > 0

  if (!hasCapsule) {
    return {
      statusBarHeight,
      headerTop: 16,
      capsuleRight: 0,
      navBarHeight: 44,
      hasCapsule: false,
    }
  }

  const gap = Math.max(4, menuTop - statusBarHeight)
  return {
    statusBarHeight,
    headerTop: Math.max(12, menuBottom - statusBarHeight + 8),
    capsuleRight: windowWidth > 0 && menuLeft > 0 ? Math.max(0, windowWidth - menuLeft + 8) : 0,
    navBarHeight: menuHeight + gap * 2,
    hasCapsule: true,
  }
}

/** 读取当前设备/窗口的胶囊布局；H5 或读取失败时回退到无胶囊布局。 */
export function readCapsuleLayout(): CapsuleLayout {
  try {
    const system = uni.getSystemInfoSync()
    const menu = typeof (uni as any).getMenuButtonBoundingClientRect === 'function'
      ? (uni as any).getMenuButtonBoundingClientRect()
      : null
    return capsuleLayoutFrom({
      statusBarHeight: system.statusBarHeight,
      windowWidth: system.windowWidth,
      menu,
    })
  } catch {
    return capsuleLayoutFrom()
  }
}
