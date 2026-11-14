import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { AttendanceService } from './attendance.service';
import { shanghaiDate } from './attendance.time';

const STORE = 'sh';
const LAT = 31.176;
const LNG = 121.459;

describe('在店时段与补签', () => {
  let h: Harness;
  let staffToken: string;
  let managerToken: string;
  let financeToken: string;
  let regionToken: string;

  const minutesAgo = (minutes: number) => Date.now() - minutes * 60_000;

  /** 把一段的到店时间往前挪，模拟「已经干了几小时」，同时对齐归属日。 */
  const shiftClockIn = async (sessionId: string, minutes: number) => {
    const at = new Date(minutesAgo(minutes));
    await h.prisma.workSession.update({
      where: { id: sessionId },
      data: { clockInAt: at, businessDate: shanghaiDate(at) }
    });
  };

  const session = (id: string) => h.prisma.workSession.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    h = await createHarness();
    staffToken = await h.login(ACCOUNTS.staffSh);
    managerToken = await h.login(ACCOUNTS.managerSh);
    financeToken = await h.login(ACCOUNTS.finance);
    regionToken = await h.login(ACCOUNTS.region);
  });

  afterAll(async () => {
    await h.close();
  });

  it('店内可以到店确认；90 秒内重复提交返回同一段，不产生第二段', async () => {
    const res = await h.api('post', '/attendance/clock-in', staffToken, {
      storeId: STORE,
      lat: LAT,
      lng: LNG,
      accuracyM: 12
    });
    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe('open');
    expect(res.body.session.inDistanceM).toBeLessThan(5);
    expect(res.body.replay).toBe(false);

    const again = await h.api('post', '/attendance/clock-in', staffToken, {
      storeId: STORE,
      lat: LAT,
      lng: LNG,
      accuracyM: 12
    });
    expect(again.status).toBe(201);
    expect(again.body.replay).toBe(true);
    expect(again.body.session.id).toBe(res.body.session.id);
    expect(await h.prisma.workSession.count({ where: { userId: 'u-gu' } })).toBe(1);
  });

  it('离店确认按实际分钟闭合', async () => {
    const open = await h.prisma.workSession.findUniqueOrThrow({ where: { openKey: 'u-gu' } });
    await shiftClockIn(open.id, 300);

    const res = await h.api('post', '/attendance/clock-out', staffToken, {
      lat: LAT,
      lng: LNG,
      accuracyM: 15
    });
    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe('closed');
    expect(res.body.minutes).toBe(300);
    expect(res.body.voided).toBe(false);
    expect(await h.prisma.workSession.findUnique({ where: { openKey: 'u-gu' } })).toBeNull();
  });

  it('离店后再点离店给出补签指引，而不是 500', async () => {
    const res = await h.api('post', '/attendance/clock-out', staffToken, {});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NO_OPEN_SESSION');
    expect(res.body.message).toContain('补签');
  });

  it('范围外与定位不可信分别给出可执行的提示', async () => {
    const far = await h.api('post', '/attendance/clock-in', staffToken, {
      storeId: STORE,
      lat: LAT + 0.003,
      lng: LNG,
      accuracyM: 10
    });
    expect(far.status).toBe(409);
    expect(far.body.error).toBe('GATE_OUT_OF_RANGE');

    const fuzzy = await h.api('post', '/attendance/clock-in', staffToken, {
      storeId: STORE,
      lat: LAT,
      lng: LNG,
      accuracyM: 800
    });
    expect(fuzzy.status).toBe(409);
    expect(fuzzy.body.error).toBe('GATE_UNTRUSTED_ACCURACY');
    // 定位失败不能留下半条在店时段
    expect(await h.prisma.workSession.findUnique({ where: { openKey: 'u-gu' } })).toBeNull();
  });

  it('忘点离店：补离店申请在批准前不计工时，批准后按申报时间闭合', async () => {
    const created = await h.api('post', '/attendance/clock-in', staffToken, {
      storeId: STORE,
      lat: LAT,
      lng: LNG,
      accuracyM: 10
    });
    const sessionId = created.body.session.id as string;
    await shiftClockIn(sessionId, 540);

    const declared = minutesAgo(480);
    const request = await h.api('post', '/attendance/requests/close', staffToken, {
      sessionId,
      clockOutAt: declared,
      reason: '忙着收档，忘了点离店'
    });
    expect(request.status).toBe(201);
    expect((await session(sessionId)).status).toBe('pending_close');
    // 申报期间 openKey 已释放，他还能马上开始下一段
    expect(await h.prisma.workSession.findUnique({ where: { openKey: 'u-gu' } })).toBeNull();

    const pending = await h.api('get', '/admin/approvals?status=pending', financeToken);
    const row = pending.body.approvals.find(
      (item: { id: string }) => item.id === request.body.approvalId
    );
    expect(row).toMatchObject({ kind: 'ATTENDANCE', requesterName: '顾小满' });

    const decide = await h.api(
      'post',
      `/admin/approvals/${request.body.approvalId}/decide`,
      financeToken,
      { decision: 'approve' }
    );
    expect(decide.status).toBe(201);
    expect(decide.body.approval.status).toBe('approved');

    const closed = await session(sessionId);
    expect(closed.status).toBe('closed');
    expect(closed.clockOutAt!.getTime()).toBe(declared);
    expect(closed.adjustedBy).toBe('u-zhou');
  });

  it('忘点到店：补签整段，批准后直接生成一条已闭合记录', async () => {
    const created = await h.api('post', '/attendance/requests/backfill', staffToken, {
      storeId: STORE,
      clockInAt: minutesAgo(420),
      clockOutAt: minutesAgo(360),
      reason: '早上开门直接干活，忘了点'
    });
    expect(created.status).toBe(201);

    await h.api('post', `/admin/approvals/${created.body.approvalId}/decide`, financeToken, {
      decision: 'approve'
    });

    const row = await h.prisma.workSession.findFirstOrThrow({
      where: { userId: 'u-gu', status: 'closed', adjustReason: '早上开门直接干活，忘了点' }
    });
    expect(row.clockOutAt!.getTime() - row.clockInAt.getTime()).toBe(60 * 60_000);
    expect(row.businessDate).toBe(shanghaiDate(row.clockInAt));
  });

  it('补签被驳回时段退回待补签，员工可以改时间重新申报', async () => {
    const created = await h.api('post', '/attendance/clock-in', staffToken, {
      storeId: STORE,
      lat: LAT,
      lng: LNG,
      accuracyM: 10
    });
    const sessionId = created.body.session.id as string;
    await shiftClockIn(sessionId, 780);

    const request = await h.api('post', '/attendance/requests/close', staffToken, {
      sessionId,
      clockOutAt: minutesAgo(720),
      reason: '记错了时间'
    });
    expect(request.status).toBe(201);

    const reject = await h.api(
      'post',
      `/admin/approvals/${request.body.approvalId}/decide`,
      financeToken,
      { decision: 'reject', comment: '和排班对不上，请按实际时间重新申报' }
    );
    expect(reject.status).toBe(201);

    const back = await session(sessionId);
    expect(back.status).toBe('lapsed');
    expect(back.pendingApprovalId).toBeNull();
    expect(back.clockOutAt).toBeNull();
  });

  it('补签只能总部审批：店长与店员本人都不能批', async () => {
    const pending = await h.prisma.approval.findFirstOrThrow({
      where: { kind: 'ATTENDANCE', status: 'pending' },
      orderBy: { createdAt: 'desc' }
    }).catch(() => null);
    // 上一例已驳回，这里没有待办就直接造一条，保证权限断言始终被执行
    const target =
      pending ||
      (await h.prisma.approval.create({
        data: {
          id: 'A-perm-test',
          kind: 'ATTENDANCE',
          status: 'pending',
          storeId: STORE,
          amountCents: 0,
          summary: '权限测试',
          payloadJson: JSON.stringify({ mode: 'backfill', storeId: STORE, clockInAt: 0, clockOutAt: 0, reason: '' }),
          requestedBy: 'u-gu',
          createdAt: new Date()
        }
      }));

    for (const token of [managerToken, staffToken]) {
      const res = await h.api('post', `/admin/approvals/${target.id}/decide`, token, {
        decision: 'approve'
      });
      expect([403, 401]).toContain(res.status);
    }

    await h.prisma.approval.delete({ where: { id: target.id } });
  });

  it('看板按人汇总已闭合工时，并单独列出待处理', async () => {
    const res = await h.api('get', `/attendance/board?storeId=${STORE}`, managerToken);
    expect(res.status).toBe(200);
    expect(res.body.summary.totalMinutes).toBe(420);
    expect(res.body.summary.unresolvedCount).toBe(1);
    expect(res.body.unresolved[0]).toMatchObject({ name: '顾小满', status: 'lapsed' });
    expect(res.body.rows[0].name).toBe('顾小满');
    expect(res.body.rows[0].minutes).toBe(420);
  });

  it('超过单段上限仍在店的段自动转待补签，工时归零', async () => {
    const created = await h.api('post', '/attendance/clock-in', staffToken, {
      storeId: STORE,
      lat: LAT,
      lng: LNG,
      accuracyM: 10
    });
    const sessionId = created.body.session.id as string;
    await shiftClockIn(sessionId, 17 * 60);

    const attendance = h.app.get(AttendanceService);
    const count = await attendance.sweepLapsed();
    expect(count).toBeGreaterThanOrEqual(1);

    const row = await session(sessionId);
    expect(row.status).toBe('lapsed');
    expect(row.openKey).toBeNull();
  });

  it('本人视图把待处理算进 unresolvedCount，金额单价不下发给店员', async () => {
    const res = await h.api('get', `/attendance/mine?storeId=${STORE}`, staffToken);
    expect(res.status).toBe(200);
    expect(res.body.policy.radiusM).toBe(100);
    expect(res.body.unresolvedCount).toBeGreaterThanOrEqual(2);
    expect(res.body).not.toHaveProperty('ratePerMinCents');
    expect(res.body.month.minutes).toBeGreaterThanOrEqual(420);
  });

  it('本人视图带坐标时给出围栏预判，且与到店确认用同一套规则', async () => {
    const at = (lat: number, accuracyM: number) =>
      `/attendance/mine?storeId=${STORE}&lat=${lat}&lng=${LNG}&accuracyM=${accuracyM}`;

    const near = await h.api('get', at(LAT + 0.0002, 20), staffToken);
    expect(near.status).toBe(200);
    // 100m 半径 + 20m 精度补偿 = 120m；点击前就能看到「在范围内」
    expect(near.body.preview).toMatchObject({ ok: true, reason: 'ok', limitM: 120 });

    const far = await h.api('get', at(LAT + 0.05, 20), staffToken);
    expect(far.body.preview.ok).toBe(false);
    expect(far.body.preview.reason).toBe('out_of_range');
    expect(far.body.preview.distanceM).toBeGreaterThan(1000);

    // 精度超过补偿上限时不再放大半径，而是直接判定不可信
    const fuzzy = await h.api('get', at(LAT, 800), staffToken);
    expect(fuzzy.body.preview.reason).toBe('untrusted_accuracy');
    expect(fuzzy.body.preview.limitM).toBe(100);

    // 没带坐标就不猜：preview 为 null，页面显示「正在获取定位」
    const none = await h.api('get', `/attendance/mine?storeId=${STORE}`, staffToken);
    expect(none.body.preview).toBeNull();
  });

  it('往天没闭合的时段也在 unresolved 里，否则页面上找不到入口去补', async () => {
    const me = await h.prisma.user.findUniqueOrThrow({ where: { username: ACCOUNTS.staffSh } });
    const yesterday = new Date(Date.now() - 26 * 3600_000);
    const date = shanghaiDate(yesterday);
    await h.prisma.workSession.create({
      data: {
        id: 'ws-old-lapsed',
        storeId: STORE,
        userId: me.id,
        businessDate: date,
        clockInAt: yesterday,
        inLat: LAT,
        inLng: LNG,
        status: 'lapsed',
        note: '超过单段上限，请补离店'
      }
    });

    const res = await h.api('get', `/attendance/mine?storeId=${STORE}`, staffToken);
    expect(res.status).toBe(200);
    const old = res.body.unresolved.find((item: { id: string }) => item.id === 'ws-old-lapsed');
    expect(old).toMatchObject({ status: 'lapsed', businessDate: date });
    // 往天的段不进「今天的时间轴」，但必须在待处理里
    expect(res.body.sessions.some((item: { id: string }) => item.id === 'ws-old-lapsed')).toBe(false);

    await h.prisma.workSession.delete({ where: { id: 'ws-old-lapsed' } });
  });

  it('看板不传门店时按本人可见范围汇总，也不允许越权缩到别人的店', async () => {
    const all = await h.api('get', '/attendance/board', regionToken);
    expect(all.status).toBe(200);
    // 区域经理只负责两家店：默认口径就是这两家，而不是全品牌
    expect(all.body.stores.map((item: { id: string }) => item.id).sort()).toEqual(['sh', 'sh-west']);
    expect(all.body.storeId).toBeNull();
    expect(all.body.storeName).toBe('全部门店');

    const one = await h.api('get', `/attendance/board?storeId=${STORE}`, regionToken);
    expect(one.body.storeId).toBe(STORE);
    // 收窄到单店后，下拉仍给出全部可见门店，否则选了店就切不回去
    expect(one.body.stores.map((item: { id: string }) => item.id).sort()).toEqual(['sh', 'sh-west']);

    const denied = await h.api('get', '/attendance/board?storeId=sx', managerToken);
    expect(denied.status).toBe(403);
  });
});
