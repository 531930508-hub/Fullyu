import type { DeviceStatus, LabelPrinter, PrintJobPayload, PrintResult } from '../../contracts';

/**
 * 芯烨 XP-420B（USB 桌面标签机）的接入点。
 *
 * 这台机只有 USB，云端 API 在公网、门店电脑在内网，服务端不可能直接把指令写进 USB 口。
 * 因此这里不是一个「打印驱动」，而是队列语义的占位实现：
 * 真正的出纸由门店营业台电脑上的打印代理（deploy/print-agent）用令牌领取任务完成。
 *
 * 关键约束：print() 永远不能返回 ok。否则订单会被标记成「已打印」，
 * 而吧台上其实一张纸都没有——这正是要避免的假成功。
 */
export class AgentLabelPrinter implements LabelPrinter {
  readonly name = 'xprinter-xp420b-agent';
  readonly mode = 'live';
  readonly transport = 'agent' as const;

  async print(): Promise<PrintResult> {
    return {
      ok: false,
      error: '芯烨 XP-420B 由门店打印代理领取任务，服务端不直接驱动 USB 打印机'
    };
  }

  async status(): Promise<DeviceStatus> {
    return {
      online: true,
      mode: 'agent',
      detail: '等待门店打印代理领取（USB / 203dpi / TSPL）'
    };
  }
}

/** 只是为了让调用方看清 transport=agent 时该走哪条路径。 */
export const isAgentTransport = (printer: { transport?: 'cloud' | 'agent' }): boolean =>
  printer.transport === 'agent';

export type { PrintJobPayload };