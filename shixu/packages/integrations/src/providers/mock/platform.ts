import type { PlatformConnector, PlatformOrder } from '../../contracts';

/**
 * 内置外卖平台连接器：不拉单、不确认。
 * 真实实现按美团 / 淘宝闪购开放平台的订单推送或轮询接口接入，
 * 拉到的订单统一转成 PlatformOrder，由业务层建单。
 */
export class MockPlatformConnector implements PlatformConnector {
  readonly name = 'mock-platform';
  readonly mode = 'mock';

  async pullOrders(_since: number): Promise<PlatformOrder[]> {
    return [];
  }

  async acknowledge(_externalId: string): Promise<boolean> {
    return true;
  }
}
