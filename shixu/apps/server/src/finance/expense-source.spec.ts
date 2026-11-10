/**
 * TX-11 费用导入幂等整改。
 *
 * 审计口径（06-整改台账.csv）：
 * - 去重检查必须与写入同事务（数据库唯一性兜底），并发/网络重试只落一次；
 * - 不能把"相同金额"当财务唯一凭证：同额不同业务的两笔费用均可入账；
 * - 源行建立数据库级唯一标识（sourceKey），重复导入可追溯。
 */
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

const HEADER = '日期,门店,类别,金额,备注';
const today = '2026-10-30';

const sheet = (rows: string[]) => [HEADER, ...rows].join('\n');

describe('费用导入幂等（TX-11）', () => {
  let h: Harness;
  let financeToken: string;

  beforeAll(async () => {
    h = await createHarness();
    financeToken = await h.login(ACCOUNTS.finance);
  });

  afterAll(async () => {
    await h.close();
  });

  const importText = (text: string) =>
    h.api('post', '/admin/expenses/import', financeToken, { text });

  it('并发提交同一文件只落一次', async () => {
    const text = sheet([
      `${today},上海·西岸店,水电物业,88,TX11并发演练`,
      `${today},上海·西岸店,人力,120,TX11并发演练`,
      `${today},上海·西岸店,租金,45,TX11并发演练`
    ]);

    const [a, b] = await Promise.all([importText(text), importText(text)]);
    const created = [a, b]
      .filter((r) => r.status === 201)
      .reduce((n, r) => n + (r.body.created as number), 0);
    expect(created).toBe(3);

    const count = await h.prisma.expense.count({
      where: { memo: 'TX11并发演练', voidedAt: null }
    });
    expect(count).toBe(3);
  });

  it('同一文件重复提交（网络重试）不重复入账且来源可追溯', async () => {
    const text = sheet([`${today},上海·西岸店,水电物业,66,TX11重试演练`]);

    const first = await importText(text);
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(1);
    const row = await h.prisma.expense.findFirst({ where: { memo: 'TX11重试演练' } });
    expect(row?.sourceKey).toMatch(/^imp:/);
    expect(row?.batchId).toMatch(/^IMP-/);

    const retry = await importText(text);
    expect(retry.status).toBe(409);
    expect(retry.body.message).toContain('重复');

    const count = await h.prisma.expense.count({
      where: { memo: 'TX11重试演练', voidedAt: null }
    });
    expect(count).toBe(1);
  });

  it('两笔合法同额费用（不同业务备注）均可入账', async () => {
    const text = sheet([
      `${today},上海·西岸店,水电物业,500,TX11十月水费`,
      `${today},上海·西岸店,水电物业,500,TX11十月电费`
    ]);

    const res = await importText(text);
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);

    // 500 元 = 50000 分：同额不同业务的两笔都应入账
    const rows = await h.prisma.expense.findMany({
      where: { amountCents: 50000, voidedAt: null, memo: { startsWith: 'TX11十月' } }
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((x) => x.sourceKey)).size).toBe(2);
  });
});
