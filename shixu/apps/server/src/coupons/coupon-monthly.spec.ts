import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { CouponMonthlyService } from './coupon-monthly.service';
import type { StaffContext } from '../common/auth.types';

const day = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

/** 与后端同一口径的当前自然月（中国时区），用来构造/断言 run_period。 */
const currentPeriod = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);

/** 后台执行是异步推进的，测试里轮询到终态为止。 */
async function waitRun(h: Harness, token: string, runId: string) {
  for (let i = 0; i < 100; i += 1) {
    const res = await h.api('get', `/admin/coupons/runs/${runId}`, token);
    expect(res.status).toBe(200);
    const status = res.body.run.status as string;
    if (status === 'succeeded' || status === 'failed') return res.body.run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('月度发放执行超时未完成');
}

const SYSTEM_ACTOR = {
  id: 'system',
  name: '系统自动发放',
  username: 'system',
  active: true,
  allStores: true,
  storeIds: [],
  roles: [],
  perms: new Set(['*']),
  tokenVersion: 0
} as unknown as StaffContext;

describe('月度定向发放', () => {
  let h: Harness;
  let admin: string;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.super);
  });

  afterAll(async () => {
    // beforeAll 挂掉时 h 还没赋值，这里不能跟着抛二次异常把真实原因盖住。
    await h?.close();
  });

  const createCoupon = async (title: string, overrides: Record<string, unknown> = {}) => {
    const res = await h.api('post', '/admin/coupons', admin, {
      title,
      scope: 'all',
      amountCents: 800,
      minSpendCents: 0,
      validFrom: day(0),
      validTo: day(30),
      ...overrides
    });
    expect(res.status).toBe(201);
    return res.body.coupon as { id: string; title: string };
  };

  it('创建校验：执行日 1~28、人群只允许全部或年卡、同券只能一条启用规则', async () => {
    const coupon = await createCoupon('月度校验券');

    const badDay = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      config: { dayOfMonth: 29 }
    });
    expect(badDay.status).toBe(400);
    // 越界在这里被入参 schema 拦下（服务层 1~28 的兜底由 logic.spec 覆盖），两种 code 都算通过。
    expect(['VALIDATION', 'INVALID_DAY']).toContain(badDay.body.error);

    const badTier = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      tier: 'standard',
      config: { dayOfMonth: 8 }
    });
    expect(badTier.status).toBe(409);
    expect(badTier.body.error).toBe('RULE_CONFLICT');

    const ok = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      config: { dayOfMonth: 8 }
    });
    expect(ok.status).toBe(201);

    // 同一张券再建一条启用中的月度规则会被挡住，避免同月叠发两张一样的券。
    const duplicate = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      config: { dayOfMonth: 9 }
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe('RULE_CONFLICT');

    // 停用后可再建（原规则停用不算冲突）。
    await h.api('patch', `/admin/coupons/rules/${ok.body.rule.id}`, admin, { enabled: false });
    const again = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      config: { dayOfMonth: 10 }
    });
    expect(again.status).toBe(201);
    await h.api('patch', `/admin/coupons/rules/${again.body.rule.id}`, admin, { enabled: false });
  });

  it('手动执行：全量会员各一张，无手机号跳过，同月不会重复发', async () => {
    const coupon = await createCoupon('月度全量券');
    const member = await h.customer('月度全量会员');
    const mute = await h.customer('月度无手机号');
    await h.prisma.customer.update({ where: { id: mute.id }, data: { phone: null } });

    const rule = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      config: { dayOfMonth: 1 }
    });
    expect(rule.status).toBe(201);
    const ruleId = rule.body.rule.id as string;

    const targetCount = await h.prisma.customer.count({ where: { phone: { not: null } } });
    const preview = await h.api('post', `/admin/coupons/rules/${ruleId}/preview`, admin);
    expect(preview.status).toBe(201);
    expect(preview.body.kindLabel).toBe('月度定向发放');
    expect(preview.body.targetCount).toBe(targetCount);
    expect(preview.body.noPhone).toBeGreaterThanOrEqual(1);
    expect(preview.body.estimatedSeconds).toBeGreaterThanOrEqual(1);

    const started = await h.api('post', `/admin/coupons/rules/${ruleId}/run`, admin);
    expect(started.status).toBe(201);
    // 返回的是「已排队」的执行记录，后台按页推进（人数不多时可能已经跑完）。
    expect(['pending', 'running', 'succeeded']).toContain(started.body.run.status);
    const run = await waitRun(h, admin, started.body.run.id);
    expect(run.status).toBe('succeeded');
    expect(run.issued).toBe(targetCount);
    expect(run.period).toBe(currentPeriod());
    expect(run.batchId).toBeTruthy();

    const issued = await h.prisma.customerCoupon.count({ where: { ruleId, rulePeriod: currentPeriod() } });
    expect(issued).toBe(targetCount);
    // 无手机号会员不在库里发券。
    const muteCoupons = await h.prisma.customerCoupon.count({ where: { ruleId, customerId: mute.id } });
    expect(muteCoupons).toBe(0);

    const mine = await h.api('get', '/customer/coupons', member.token);
    const row = mine.body.coupons.find((item: { title: string }) => item.title === '月度全量券');
    expect(row).toBeTruthy();
    expect(row.source).toBe('auto');

    // 同一个月再点执行：直接拒绝，不会补发第二张。
    const repeat = await h.api('post', `/admin/coupons/rules/${ruleId}/run`, admin);
    expect(repeat.status).toBe(409);
    expect(repeat.body.error).toBe('ALREADY_DONE');

    // 列表页带出本月状态与人群标签，前端进度条据此渲染。
    const list = await h.api('get', '/admin/coupons/rules', admin);
    const saved = list.body.rules.find((item: { id: string }) => item.id === ruleId);
    expect(saved.tierLabel).toBe('全部会员');
    expect(saved.currentRun.status).toBe('succeeded');
    expect(saved.currentRun.progress).toBe(100);
    expect(saved.runCount).toBe(1);
  });

  it('仅年卡会员：普通会员不发，Full愈 会员照常发', async () => {
    const coupon = await createCoupon('月度年卡券');
    const annual = await h.customer('月度年卡会员');
    const normal = await h.customer('月度普通会员');
    await h.prisma.customer.update({ where: { id: annual.id }, data: { memberTier: 'annual' } });
    await h.prisma.customer.update({ where: { id: normal.id }, data: { memberTier: 'standard' } });

    const rule = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      tier: 'annual',
      config: { dayOfMonth: 1 }
    });
    expect(rule.status).toBe(201);
    const ruleId = rule.body.rule.id as string;

    const annualCount = await h.prisma.customer.count({ where: { phone: { not: null }, memberTier: 'annual' } });
    const started = await h.api('post', `/admin/coupons/rules/${ruleId}/run`, admin);
    const run = await waitRun(h, admin, started.body.run.id);
    expect(run.status).toBe('succeeded');
    expect(run.issued).toBe(annualCount);

    const annualCoupons = await h.prisma.customerCoupon.count({ where: { ruleId, customerId: annual.id } });
    const normalCoupons = await h.prisma.customerCoupon.count({ where: { ruleId, customerId: normal.id } });
    expect(annualCoupons).toBe(1);
    expect(normalCoupons).toBe(0);
  });

  it('失败后继续执行：从断点续跑，已经发过的人不会重复', async () => {
    const coupon = await createCoupon('月度断点券');
    // 自己造会员，避免依赖前面用例留下的数据；断点位置取排序后的中段。
    await h.customer('断点会员甲');
    await h.customer('断点会员乙');
    await h.customer('断点会员丙');
    const all = await h.prisma.customer.findMany({
      where: { phone: { not: null } },
      orderBy: { id: 'asc' },
      select: { id: true }
    });
    expect(all.length).toBeGreaterThanOrEqual(3);
    const cursorIdx = Math.max(1, Math.floor(all.length / 2));
    const cursor = all[cursorIdx]!;
    // cursorId 的语义是「最后一条已写入」，所以断点本身也算已发。
    const before = all.slice(0, cursorIdx + 1);
    const rule = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      config: { dayOfMonth: 1 }
    });
    const ruleId = rule.body.rule.id as string;
    const period = currentPeriod();

    // 构造「跑到断点就崩了」的现场：断点之前的会员都已拿到券，cursor 停在断点本人。
    await h.prisma.customerCoupon.createMany({
      data: before.map((row, index) => ({
        id: `CC-MONTHLY-RESUME-${index}`,
        couponId: coupon.id,
        customerId: row.id,
        status: 'available',
        issuedAt: new Date(),
        validFrom: new Date(),
        validTo: new Date(Date.now() + 7 * 86400000),
        ruleId,
        rulePeriod: period
      }))
    });
    await h.prisma.couponRuleRun.create({
      data: {
        id: 'CRR-MONTHLY-RESUME',
        ruleId,
        couponId: coupon.id,
        period,
        trigger: 'manual',
        status: 'failed',
        targetCount: all.length,
        issued: before.length,
        skipped: 0,
        cursorId: cursor.id,
        attempts: 1,
        lastError: '模拟写库中断',
        operatorId: 'system',
        operatorName: '系统自动发放',
        createdAt: new Date()
      }
    });

    const resumed = await h.api('post', '/admin/coupons/runs/CRR-MONTHLY-RESUME/continue', admin);
    expect(resumed.status).toBe(201);
    const run = await waitRun(h, admin, 'CRR-MONTHLY-RESUME');
    expect(run.status).toBe('succeeded');
    // issued 是整轮累计：断点之前那批（上一轮已发）+ 断点之后（含断点本人）补的。
    expect(run.issued).toBe(all.length);
    expect(run.skipped).toBe(0);
    // 一人一张：断点之前的不重发，断点之后（含断点本人）都补上。
    expect(await h.prisma.customerCoupon.count({ where: { ruleId, rulePeriod: period } })).toBe(all.length);
    expect(await h.prisma.customerCoupon.count({ where: { ruleId, customerId: before[0]!.id } })).toBe(1);
    expect(await h.prisma.customerCoupon.count({ where: { ruleId, customerId: cursor.id } })).toBe(1);

    // 已完成的执行不能再「继续」，也不允许把旧月份的记录偷偷跑到本月。
    const done = await h.api('post', '/admin/coupons/runs/CRR-MONTHLY-RESUME/continue', admin);
    expect(done.status).toBe(409);
    expect(done.body.error).toBe('ALREADY_DONE');
  });

  it('调度器到执行日自动发起，并把整轮跑完', async () => {
    const coupon = await createCoupon('月度自动券');
    const member = await h.customer('月度自动会员');
    const rule = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: coupon.id,
      kind: 'monthly',
      // 1 号每天都是「已到执行日」，用例不受当天日期影响
      config: { dayOfMonth: 1 }
    });
    const ruleId = rule.body.rule.id as string;

    const monthly = h.app.get(CouponMonthlyService);
    await monthly.tick(SYSTEM_ACTOR);

    const runs = await h.api('get', `/admin/coupons/runs?ruleId=${ruleId}`, admin);
    expect(runs.status).toBe(200);
    expect(runs.body.runs).toHaveLength(1);
    expect(runs.body.runs[0].trigger).toBe('auto');
    const run = await waitRun(h, admin, runs.body.runs[0].id);
    expect(run.status).toBe('succeeded');
    expect(await h.prisma.customerCoupon.count({ where: { ruleId, customerId: member.id } })).toBe(1);
  });
});