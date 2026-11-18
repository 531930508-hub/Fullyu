import { taskGate } from './tasks-config'

describe('定时任务总闸 taskGate', () => {
  it('不配置时全部放行（保持原有行为）', () => {
    for (const key of ['coupon', 'brand-order', 'card-sweep', 'attendance', 'daily-sweep'] as const) {
      expect(taskGate(key, {}).allowed).toBe(true)
    }
  })

  it('TASKS_ENABLED=false / 0 / off / NO 时全部关闭，并给出原因', () => {
    for (const value of ['false', '0', 'off', 'NO', ' FALSE ']) {
      const gate = taskGate('coupon', { TASKS_ENABLED: value })
      expect(gate.allowed).toBe(false)
      expect(gate.reason).toContain('TASKS_ENABLED')
    }
  })

  it('TASKS_ONLY 只放行列出的任务', () => {
    const env = { TASKS_ONLY: ' coupon , daily-sweep ' }
    expect(taskGate('coupon', env).allowed).toBe(true)
    expect(taskGate('daily-sweep', env).allowed).toBe(true)
    expect(taskGate('attendance', env).allowed).toBe(false)
    expect(taskGate('attendance', env).reason).toContain('TASKS_ONLY')
  })

  it('总闸优先：TASKS_ENABLED=false 时 TASKS_ONLY 不起作用', () => {
    expect(taskGate('coupon', { TASKS_ENABLED: '0', TASKS_ONLY: 'coupon' }).allowed).toBe(false)
  })

  it('TASKS_ONLY 为空串等同于不配置', () => {
    expect(taskGate('attendance', { TASKS_ONLY: '   ' }).allowed).toBe(true)
  })
})