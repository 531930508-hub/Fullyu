import type { PrismaService } from '../common/prisma.service';
import { BrandOrderReporter } from './brand-order.reporter';
import type { BrandMemberClient } from './brand-member.client';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const PAID_AT = new Date('2026-11-10T03:00:00.000Z');

function setup() {
  const findOrders = jest.fn();
  const findRefunds = jest.fn();
  const prisma = {
    order: { findMany: findOrders },
    refundIntent: { findMany: findRefunds }
  } as unknown as PrismaService;
  const brand = {
    enabled: true,
    reportOrder: jest.fn().mockResolvedValue({}),
    refundOrder: jest.fn().mockResolvedValue({})
  } as unknown as BrandMemberClient;
  return { reporter: new BrandOrderReporter(prisma, brand), brand, findOrders, findRefunds };
}

const order = (patch: Record<string, unknown> = {}) => ({
  id: 'O1',
  customerId: 'C1',
  totalCents: 5000,
  refundedCents: 0,
  memberDiscountCents: 500,
  paidAt: PAID_AT,
  ...patch
});

describe('BrandOrderReporter', () => {
  it('付款 7 天后才退款的订单仍会补扫，并按实际退款时间和累计金额上报', async () => {
    const { reporter, brand, findOrders, findRefunds } = setup();
    findRefunds
      .mockResolvedValueOnce([{ orderId: 'O1' }])
      .mockResolvedValueOnce([
        { orderId: 'O1', amountCents: 1000, updatedAt: new Date('2026-11-12T09:00:00.000Z') },
        { orderId: 'O1', amountCents: 2000, updatedAt: new Date('2026-11-19T08:30:00.000Z') }
      ]);
    findOrders.mockResolvedValue([order({ refundedCents: 3000 })]);

    const result = await reporter.runOnce(NOW);

    expect(result).toMatchObject({ reported: 1, refunded: 1, failed: 0 });
    expect(findOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ paidAt: { gte: new Date('2026-11-13T12:00:00.000Z') } }, { id: { in: ['O1'] } }]
        })
      })
    );
    expect(brand.reportOrder).toHaveBeenCalledWith('C1', {
      orderRef: 'O1',
      paidCents: 5000,
      savedCents: 500,
      occurredAt: PAID_AT.toISOString()
    });
    expect(brand.refundOrder).toHaveBeenCalledWith('C1', {
      orderRef: 'O1',
      refundCents: 3000,
      occurredAt: '2026-11-19T08:30:00.000Z'
    });
  });

  it('累计金额以全部成功退款单为准，订单列偏小时不向 CRM 少报', async () => {
    const { reporter, brand, findOrders, findRefunds } = setup();
    findRefunds
      .mockResolvedValueOnce([{ orderId: 'O1' }])
      .mockResolvedValueOnce([
        { orderId: 'O1', amountCents: 3000, updatedAt: new Date('2026-11-19T08:30:00.000Z') }
      ]);
    findOrders.mockResolvedValue([order({ refundedCents: 1000 })]);

    await reporter.runOnce(NOW);

    expect(brand.refundOrder).toHaveBeenCalledWith(
      'C1',
      expect.objectContaining({ refundCents: 3000 })
    );
  });

  it('无退款变化的窗口内订单不重复上报', async () => {
    const { reporter, brand, findOrders, findRefunds } = setup();
    findRefunds.mockResolvedValue([]);
    findOrders.mockResolvedValue([order()]);

    await reporter.runOnce(NOW);
    await reporter.runOnce(NOW);

    expect(brand.reportOrder).toHaveBeenCalledTimes(1);
    expect(brand.refundOrder).not.toHaveBeenCalled();
  });
});
