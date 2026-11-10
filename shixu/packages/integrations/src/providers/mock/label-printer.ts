import type { DeviceStatus, LabelPrinter, PrintJobPayload, PrintResult } from '../../contracts';
import { wait } from './util';

/**
 * 内置云标签打印实现，只记录打印请求、不连任何打印机。
 * 真实驱动（飞鹅 / 得力 / 其它云打印）实现 LabelPrinter：把 labels 转成厂商模板后下发。
 */
export class MockLabelPrinter implements LabelPrinter {
  readonly name = 'mock-cloud-label';
  readonly mode = 'mock';
  private failure: string | null = null;

  /** 自检用：让下一次打印失败，验证异常路径。 */
  failNext(error = '标签机离线'): void {
    this.failure = error;
  }

  async print(job: PrintJobPayload): Promise<PrintResult> {
    await wait(20);
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      return { ok: false, error };
    }
    return { ok: true, providerRef: `PRINT-${job.orderNumber}-${Date.now()}` };
  }

  async status(): Promise<DeviceStatus> {
    return { online: true, mode: this.mode, detail: '适配层已就绪，尚未配置云打印凭证' };
  }
}
