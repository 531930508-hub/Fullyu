import type { BrewCommand, BrewResult, DeviceStatus, TeaMachineAdapter } from '../../contracts';
import { wait } from './util';

/**
 * 三台泡茶机的能力接口，当前只登记指令、不向设备下发。
 * 真实设备接入由门店设备网关实现 TeaMachineAdapter（MQTT / 串口 / 厂商云 API）。
 */
export class MockTeaMachine implements TeaMachineAdapter {
  readonly name = 'mock-tea-machine';
  readonly mode = 'mock';

  async status(): Promise<Array<DeviceStatus & { id: string; kind: string }>> {
    return [1, 2, 3].map((n) => ({
      id: `brew-${n}`,
      kind: 'tea-machine',
      online: true,
      mode: this.mode,
      detail: '适配层已就绪，尚未绑定设备编号'
    }));
  }

  async brew(command: BrewCommand): Promise<BrewResult> {
    await wait(10);
    return {
      accepted: true,
      machineId: 'brew-1',
      detail: `已记录冲泡请求 ${command.productName} ${command.doseGrams}g；设备未绑定，未下发启动指令`
    };
  }
}
