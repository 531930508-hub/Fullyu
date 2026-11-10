import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

const BENEFITS = [
  { business: 'ql', title: '轻疗 · 项目会员价', desc: '提前预约、当日预约分别享会员价' },
  { business: 'presence', title: '在场 · 课程会员价', desc: '畅练卡有效时仍按畅练卡免费' }
];

describe('CRM 1B：品牌卡产品版本与业务会员卡目录', () => {
  let h: Harness;
  let admin: string;
  let ops: string;
  let fin: string;
  let cs: string;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
    ops = await h.login(ACCOUNTS.ops);
    fin = await h.login(ACCOUNTS.finance);
    cs = await h.login(ACCOUNTS.cs);
  });

  afterAll(async () => {
    await h.close();
  });

  it('种子：年卡/月卡各一版，年卡价格与权益、积分口径正确', async () => {
    const res = await h.api('get', '/brand-cards', admin);
    expect(res.status).toBe(200);
    const annual = res.body.products.find((p: { code: string }) => p.code === 'FY_ANNUAL');
    expect(annual.name).toBe('Full愈年卡');
    expect(annual.currentVersion).toBe(1);
    expect(annual.current.priceCents).toBe(29900);
    expect(annual.current.validDays).toBe(365);
    expect(annual.current.benefits).toHaveLength(3);
    expect(annual.current.pointsSpend.ql).toBe('1_point_1_yuan');
    expect(annual.current.pointsSpend.sx).toBe('display_only');
    const month = res.body.products.find((p: { code: string }) => p.code === 'FY_MONTH');
    expect(month.current.priceCents).toBe(4500);
    expect(month.current.validDays).toBe(30);
  });

  it('业务卡目录：在场畅练卡只读、不可在 CRM 售卖；内部键与对外键同时返回', async () => {
    const res = await h.api('get', '/business-cards', fin);
    expect(res.status).toBe(200);
    const pass = res.body.cards.find((c: { cardCode: string }) => c.cardCode === 'PRESENCE_PASS');
    expect(pass.business).toBe('zc');
    expect(pass.businessKey).toBe('presence');
    expect(pass.businessName).toBe('在场');
    expect(pass.name).toBe('在场畅练卡');
    expect(pass.readOnly).toBe(true);
    expect(pass.sellableInCrm).toBe(false);
    expect(pass.sourceSystem).toBe('presence');
    const legacy = res.body.cards.find((c: { cardCode: string }) => c.cardCode === 'RETREAT_LEGACY_CARD');
    expect(legacy.businessKey).toBe('retreat');
    expect(legacy.readOnly).toBe(true);
  });

  it('版本状态机：草稿不影响现价，激活后旧版归档；重复激活与回滚旧版均拒绝', async () => {
    const draft = await h.api('post', '/brand-cards/FY_ANNUAL/versions', ops, {
      priceCents: 32900,
      validDays: 365,
      benefits: BENEFITS,
      pointsSpend: { retreat: '1_point_1_yuan', teahour: 'display_only' },
      gameEnabled: false,
      note: '调价'
    });
    expect(draft.status).toBe(201);
    expect(draft.body.version).toBe(2);
    expect(draft.body.status).toBe('DRAFT');
    expect(draft.body.benefits.find((b: { business: string }) => b.business === 'zc')).toBeTruthy();
    expect(draft.body.pointsSpend.ql).toBe('1_point_1_yuan');

    const before = await h.api('get', '/brand-cards/FY_ANNUAL', admin);
    expect(before.body.currentVersion).toBe(1);
    expect(before.body.current.priceCents).toBe(29900);

    const activated = await h.api('post', '/brand-cards/FY_ANNUAL/versions/2/activate', ops);
    expect(activated.status).toBe(201);
    expect(activated.body.currentVersion).toBe(2);
    expect(activated.body.current.priceCents).toBe(32900);
    expect(activated.body.current.gameEnabled).toBe(false);
    const v1 = activated.body.versions.find((v: { version: number }) => v.version === 1);
    expect(v1.status).toBe('ARCHIVED');
    expect(v1.archivedAt).toBeTruthy();

    const again = await h.api('post', '/brand-cards/FY_ANNUAL/versions/2/activate', ops);
    expect(again.status).toBe(409);
    const rollback = await h.api('post', '/brand-cards/FY_ANNUAL/versions/1/activate', ops);
    expect(rollback.status).toBe(409);

    const audit = await h.api('get', `/audit?action=${encodeURIComponent('激活大会员卡版本')}`, admin);
    expect(audit.body.logs.some((log: { target: string }) => log.target === 'FY_ANNUAL v2')).toBe(true);
  });

  it('版本校验：价格/天数/权益/积分模式非法均 400，客服不能建版本', async () => {
    const base = {
      priceCents: 29900,
      validDays: 365,
      benefits: BENEFITS,
      pointsSpend: { ql: '1_point_1_yuan' }
    };
    const badPrice = await h.api('post', '/brand-cards/FY_ANNUAL/versions', ops, {
      ...base,
      priceCents: 299.5
    });
    expect(badPrice.status).toBe(400);
    const badDays = await h.api('post', '/brand-cards/FY_ANNUAL/versions', ops, { ...base, validDays: 0 });
    expect(badDays.status).toBe(400);
    const noBenefit = await h.api('post', '/brand-cards/FY_ANNUAL/versions', ops, {
      ...base,
      benefits: []
    });
    expect(noBenefit.status).toBe(400);
    const dup = await h.api('post', '/brand-cards/FY_ANNUAL/versions', ops, {
      ...base,
      benefits: [BENEFITS[0], BENEFITS[0]]
    });
    expect(dup.status).toBe(400);
    const unknown = await h.api('post', '/brand-cards/FY_ANNUAL/versions', ops, {
      ...base,
      benefits: [{ business: 'unknown', title: 'x' }]
    });
    expect(unknown.status).toBe(400);
    const badSpend = await h.api('post', '/brand-cards/FY_ANNUAL/versions', ops, {
      ...base,
      pointsSpend: { ql: '2_points_1_yuan' }
    });
    expect(badSpend.status).toBe(400);
    const denied = await h.api('post', '/brand-cards/FY_ANNUAL/versions', cs, base);
    expect(denied.status).toBe(403);
    const deniedFin = await h.api('post', '/brand-cards/FY_ANNUAL/versions/1/activate', fin);
    expect(deniedFin.status).toBe(403);
  });

  it('新建产品：编码格式与重复校验；新版本可独立激活', async () => {
    const created = await h.api('post', '/brand-cards', admin, { code: 'fy_test', name: '测试卡', sort: 9 });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe('FY_TEST');
    expect(created.body.currentVersion).toBeNull();
    const dup = await h.api('post', '/brand-cards', admin, { code: 'FY_TEST', name: '重复' });
    expect(dup.status).toBe(409);
    const bad = await h.api('post', '/brand-cards', admin, { code: 'TEST', name: '坏编码' });
    expect(bad.status).toBe(400);

    const version = await h.api('post', '/brand-cards/FY_TEST/versions', admin, {
      priceCents: 100,
      validDays: 1,
      benefits: [{ business: 'sx', title: '测试权益' }],
      gameEnabled: false
    });
    expect(version.status).toBe(201);
    expect(version.body.version).toBe(1);
    const activated = await h.api('post', '/brand-cards/FY_TEST/versions/1/activate', admin);
    expect(activated.status).toBe(201);
    expect(activated.body.current.version).toBe(1);
  });

  it('业务卡目录：仅可改展示字段；只读/售卖归属不可改；客服无编辑权限', async () => {
    const updated = await h.api('patch', '/business-cards/zc/PRESENCE_PASS', ops, {
      name: '在场畅练卡',
      benefit: '有效期内课程免费（以在场卡期为准）',
      description: '只读展示',
      sort: 3
    });
    expect(updated.status).toBe(200);
    expect(updated.body.benefit).toContain('以在场卡期为准');
    expect(updated.body.readOnly).toBe(true);
    expect(updated.body.sellableInCrm).toBe(false);
    expect(updated.body.sourceSystem).toBe('presence');

    const readOnly = await h.api('patch', '/business-cards/zc/PRESENCE_PASS', admin, { readOnly: false });
    expect(readOnly.status).toBe(400);
    const sellable = await h.api('patch', '/business-cards/zc/PRESENCE_PASS', admin, { sellableInCrm: true });
    expect(sellable.status).toBe(400);
    const missing = await h.api('patch', '/business-cards/zc/UNKNOWN', ops, { name: 'x' });
    expect(missing.status).toBe(404);
    const denied = await h.api('patch', '/business-cards/zc/PRESENCE_PASS', cs, { name: 'x' });
    expect(denied.status).toBe(403);

    const filtered = await h.api('get', '/business-cards?business=presence', admin);
    expect(filtered.body.cards).toHaveLength(1);
    expect(filtered.body.cards[0].cardCode).toBe('PRESENCE_PASS');
  });
});
