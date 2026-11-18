/**
 * 定时任务总闸（双机切换用）。
 *
 * - `TASKS_ENABLED=false`（0/false/off/no）：五类定时任务一律不启动。备机、演练时用。
 * - `TASKS_ONLY=coupon,brand-order`：只启动列出的任务，其余不启动。单任务灰度与排障用。
 * - 两者都不配：保持原有行为，各任务自己的开关（COUPON_RULES_ENABLED 等）仍然生效。
 *
 * 只决定「定时器是否启动」。接口里手工触发的动作（如「立即执行」）不受影响，
 * 避免把运维开关误当成业务权限。
 */
export const TASK_KEYS = ['coupon', 'brand-order', 'card-sweep', 'attendance', 'daily-sweep'] as const

export type TaskKey = (typeof TASK_KEYS)[number]

const OFF_VALUES = ['0', 'false', 'off', 'no']

export type TaskGate = { allowed: boolean; reason?: string }

export function taskGate(key: TaskKey, env: NodeJS.ProcessEnv = process.env): TaskGate {
  const master = String(env.TASKS_ENABLED ?? '').trim().toLowerCase()
  if (OFF_VALUES.includes(master)) {
    return { allowed: false, reason: `TASKS_ENABLED=${master}` }
  }
  const only = String(env.TASKS_ONLY ?? '').trim()
  if (only) {
    const list = only
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    if (!list.includes(key)) {
      return { allowed: false, reason: `TASKS_ONLY=${only}` }
    }
  }
  return { allowed: true }
}

/** 调度器 onModuleInit 里的统一入口：返回 false 表示不要启动定时器，并留下一行原因。 */
export function taskGateOrLog(
  key: TaskKey,
  logger: { warn: (message: string) => void },
  label: string
): boolean {
  const gate = taskGate(key)
  if (!gate.allowed) {
    logger.warn(`${label} 未启动（${gate.reason}）`)
    return false
  }
  return true
}