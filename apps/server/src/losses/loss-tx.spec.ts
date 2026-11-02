/**
 * TX-09 报损审批一致性整改。
 *
 * 审计口径（06-整改台账.csv）：
 * - 报损审批与执行必须在同一事务内条件迁移：状态赢得者才执行扣减；
 * - 批准/驳回/双人并发不允许出现"扣了库存但审批仍待办"或状态分裂；
 * - 库存不足时整体回滚，不残留部分状态。
 */
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

describe('报损审批一致性（TX-09）', () => {
  let h: Harness;
  let managerToken: string;
  let financeToken: string;

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
    financeToken = await h.login(ACCOUNTS.finance);
  });

  afterAll(async () => {
    await h.close();
  });

  const grams = async () => {
    const stock = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    return stock?.grams ?? 0;
  };

  const reportLoss = async (qty = 70, reason = '并发审批演练') => {
    const res = await h.api('post', '/store/losses', managerToken, {
      storeId: 'sh',
      productId: 'xing-0',
      qty,
      reason
    });
    if (res.status !== 201) throw new Error(`报损登记失败 ${res.status} ${res.text}`);
    return res.body.loss as { id: string; status: string; approvalId: string | null };
  };

  const decide = (approvalId: string, decision: 'approve' | 'reject') =>
    h.api('post', `/admin/approvals/${approvalId}/decide`, financeToken, { decision });

  it('双人并发批准只允许一个胜者，库存只扣一次', async () => {
    const before = await grams();
    const loss = await reportLoss();
    expect(loss.approvalId).toMatch(/^AP-/);

    const [a, b] = await Promise.all([
      decide(loss.approvalId as string, 'approve'),
      decide(loss.approvalId as string, 'approve')
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);

    expect(await grams()).toBe(before - 70);
    const row = await h.prisma.loss.findUnique({ where: { id: loss.id } });
    expect(row?.status).toBe('approved');
    const approval = await h.prisma.approval.findUnique({ where: { id: loss.approvalId as string } });
    expect(approval?.status).toBe('approved');
  });

  it('批准与驳回交错只允许一种结果，库存与状态一致', async () => {
    const before = await grams();
    const loss = await reportLoss(70, '批准驳回交错演练');

    const [a, b] = await Promise.all([
      decide(loss.approvalId as string, 'approve'),
      decide(loss.approvalId as string, 'reject')
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);

    const lossRow = await h.prisma.loss.findUnique({ where: { id: loss.id } });
    const approval = await h.prisma.approval.findUnique({
      where: { id: loss.approvalId as string }
    });
    expect(lossRow?.status).toBe(approval?.status);
    // 只有批准才扣库存；驳回不扣
    if (approval?.status === 'approved') {
      expect(await grams()).toBe(before - 70);
    } else {
      expect(approval?.status).toBe('rejected');
      expect(await grams()).toBe(before);
    }
  });

  it('批准时库存不足：整体回滚，报损与审批都保持待办', async () => {
    const loss = await reportLoss(70, '库存不足演练');
    expect(loss.status).toBe('pending');
    // 登记后库存被其他业务消耗到不足（直接改库存模拟），批准应整体失败
    await h.prisma.stock.update({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } },
      data: { grams: 10 }
    });
    const before = await grams();
    expect(before).toBe(10);

    const res = await decide(loss.approvalId as string, 'approve');
    expect(res.status).toBe(409);

    const lossRow = await h.prisma.loss.findUnique({ where: { id: loss.id } });
    expect(lossRow?.status).toBe('pending');
    const approval = await h.prisma.approval.findUnique({
      where: { id: loss.approvalId as string }
    });
    expect(approval?.status).toBe('pending');
    expect(await grams()).toBe(before);
  });
});
