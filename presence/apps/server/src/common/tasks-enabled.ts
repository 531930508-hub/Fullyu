/**
 * 定时任务开关：双机部署时，定时任务必须在**且仅在**一台机器上跑，
 * 否则两台机器各跑一遍 —— 退款重试、对账、自动结课都会重复执行。
 *
 * 约定：
 *   TASKS_ENABLED 未设置        → 开（单机现状，行为不变）
 *   TASKS_ENABLED=true          → 开（主用机）
 *   TASKS_ENABLED=false         → 关（备用机：进程在线、能接请求，但不跑任何 cron）
 *
 * 主备切换时：备机改 true、主机改 false，各自 pm2 restart 即可，不需要改代码。
 */
export function tasksEnabled(): boolean {
  return (process.env.TASKS_ENABLED || 'true').trim().toLowerCase() !== 'false'
}