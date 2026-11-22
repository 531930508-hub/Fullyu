/**
 * 现金退款：钱是门店当面收的，收银渠道里没有这笔原交易，不能硬调网关。
 *
 * 11-22 门店反馈「现金收款退款失败」：现金单拿着渠道流水号去汇付退款，
 * 汇付回「原交易不存在」，退款在占用阶段就被判失败释放，订单一直停在已支付。
 * 现金单的退款必须走本地落账：确认可退数量、回补库存与财务流水照旧，
 * 钱由店员当面交还顾客，网关一次都不能调。
 */
import { ACCOUNTS, createHarness, freshOrderBody, type Harness } from '../testing/harness';
import { HardwareService } from '../hardware/hardware.module';
import type { PaymentResult } from '@teahour/integrations';

describe('现金退款走本地落账', () => {
  let h: Harness;
  let managerToken: string;
  let financeToken: string;
  let refundCalls: string[];

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
    financeToken = await h.login(ACCOUNTS.finance);
    refundCalls = [];
  });

  afterAll(async () => {
    await h.close();
  });

  /** 营业台现金单：生产异步渠道落 CASH-<单号>，同步/mock 渠道还会挂上渠道流水号——都不能送去网关。 */
  const placeCash = async (qty = 1) => {
    const res = await h.api('post', '/store/orders', managerToken, {
      storeId: 'sh',
      type: 'takeaway',
      paymentMethod: 'cash',
      items: [{ productId: 'xing-0', qty, temp: '热' }]
    });
    if (res.status !== 201) throw new Error(`现金下单失败 ${res.status} ${res.text}`);
    return res.body.order as {
      id: string;
      number: string;
      totalCents: number;
      paymentMethod: string;
      paymentRef: string;
      status: string;
    };
  };

  /** 网关一被调用就是回归：现金单没有可退的原交易，调用必然失败。 */
  const failGatewayIfCalled = () => {
    const gateway = h.app.get(HardwareService).payment as unknown as {
      refund: (req: { reference: string }) => Promise<PaymentResult>;
    };
    refundCalls = [];
    gateway.refund = async (req) => {
      refundCalls.push(req.reference);
      return { ok: false, error: '原交易不存在' };
    };
  };

  it('现金单退款不调网关：按实付落账、回补库存、台账记为现金退还', async () => {
    failGatewayIfCalled();
    const order = await placeCash();
    // 关键前提：同步/mock 下现金单也带着渠道流水号，只按 paymentRef 判断会误送网关。
    expect(order.paymentMethod).toBe('cash');
    expect(order.paymentRef).toBeTruthy();

    const product = await h.prisma.product.findUnique({ where: { id: 'xing-0' } });
    const before = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });

    const res = await h.api('post', `/store/orders/${order.id}/refund`, managerToken, {
      reason: '顾客现金退款'
    });
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('refunded');
    expect(res.body.channel).toBe('cash');
    expect(res.body.refundedCents).toBe(2000);
    expect(refundCalls).toHaveLength(0);

    const intent = await h.prisma.refundIntent.findFirst({ where: { orderId: order.id } });
    expect(intent?.status).toBe('succeeded');
    expect(intent?.providerRef).toBeNull();

    const entry = await h.prisma.financeEntry.findFirst({ where: { orderId: order.id, type: 'REFUND' } });
    expect(entry?.method).toBe('现金退还');
    expect(entry?.amountCents).toBe(-2000);
    expect(entry?.settlement).toBe('settled');

    // 未制作的杯按配方回补原料库存
    const after = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    expect(Number(after?.grams)).toBeCloseTo(Number(before?.grams) + Number(product?.doseG), 6);

    const fresh = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh?.refundedCents).toBe(2000);
    expect(fresh?.status).toBe('refunded');
    expect(fresh?.refundPending).toBe(false);
  });

  it('现金单走审批时也登记为现金退款，审批通过不触碰网关', async () => {
    failGatewayIfCalled();
    const order = await placeCash(3);
    expect(order.totalCents).toBe(6000);

    const request = await h.api('post', `/store/orders/${order.id}/refund`, managerToken, {
      reason: '现金大额退款'
    });
    expect(request.body.mode).toBe('approval');
    expect(request.body.channel).toBe('cash');
    expect(refundCalls).toHaveLength(0);

    const approved = await h.api(
      'post',
      `/admin/approvals/${request.body.approval.id}/decide`,
      financeToken,
      { decision: 'approve', comment: '同意现金退款' }
    );
    expect(approved.status).toBe(201);
    expect(approved.body.approval.executionStatus).toBe('succeeded');
    expect(approved.body.approval.resultNote).toContain('现金退款');
    expect(approved.body.approval.resultNote).toContain('交还顾客');
    expect(refundCalls).toHaveLength(0);

    const entry = await h.prisma.financeEntry.findFirst({ where: { orderId: order.id, type: 'REFUND' } });
    expect(entry?.method).toBe('现金退还');
    expect(entry?.amountCents).toBe(-6000);
  });

  it('在线支付单仍按原路退回，渠道调用不受影响', async () => {
    failGatewayIfCalled();
    const gateway = h.app.get(HardwareService).payment as unknown as {
      refund: (req: { reference: string }) => Promise<PaymentResult>;
    };
    gateway.refund = async (req) => {
      refundCalls.push(req.reference);
      return { ok: true, providerRef: `REF-CASH-SPEC-${refundCalls.length}`, paidAt: Date.now() };
    };

    const placed = await h.api('post', '/customer/orders', (await h.customer('现金退款对照茶客')).token, {
      ...freshOrderBody(),
      type: 'takeaway',
      seat: null
    });
    expect(placed.status).toBe(201);
    const orderId = placed.body.order.id as string;

    const res = await h.api('post', `/store/orders/${orderId}/refund`, managerToken, {});
    expect(res.status).toBe(201);
    expect(res.body.channel).toBe('gateway');
    expect(refundCalls).toHaveLength(1);

    const entry = await h.prisma.financeEntry.findFirst({ where: { orderId, type: 'REFUND' } });
    expect(entry?.method).toBe('原路退回');
  });
});