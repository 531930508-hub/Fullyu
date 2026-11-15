import type { BrandMemberClient, BrandProduct } from './brand-member.client';
import { BrandPerksService, DEFAULT_PER_CUP_CENTS } from './brand-perks.service';

function product(code: string, perCupCents: unknown): BrandProduct {
  return {
    code,
    name: code,
    priceCents: 29_900,
    validDays: 365,
    benefits: [],
    perks: { teahour: { perCupCents } },
    pointsSpend: {},
    gameEnabled: true
  };
}

function fakeClient(enabled: boolean, products: () => Promise<{ products: BrandProduct[] }>) {
  return {
    enabled,
    products: jest.fn(products)
  } as unknown as BrandMemberClient & { products: jest.Mock };
}

describe('时叙每杯立减金额（CRM 下发）', () => {
  let now = 1_000_000;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('未接入 CRM 时沿用本地默认 200 分', async () => {
    const client = fakeClient(false, () => Promise.reject(new Error('不应调用')));
    const perks = new BrandPerksService(client);

    await expect(perks.perCupCents()).resolves.toBe(DEFAULT_PER_CUP_CENTS);
    expect(client.products).not.toHaveBeenCalled();
  });

  it('读取年卡 perks.teahour.perCupCents，并在缓存期内不重复请求', async () => {
    const client = fakeClient(true, () =>
      Promise.resolve({ products: [product('FY_MONTH', 0), product('FY_ANNUAL', 150)] })
    );
    const perks = new BrandPerksService(client);

    await expect(perks.perCupCents()).resolves.toBe(150);
    now += 30_000;
    await expect(perks.perCupCents()).resolves.toBe(150);
    expect(client.products).toHaveBeenCalledTimes(1);

    // 缓存到期后重新读取，CRM 改价一分钟内生效
    now += 31_000;
    client.products.mockResolvedValueOnce({ products: [product('FY_ANNUAL', 100)] });
    await expect(perks.perCupCents()).resolves.toBe(100);
    expect(client.products).toHaveBeenCalledTimes(2);
  });

  it('缺配置或金额越界一律按 0，避免凭空多减', async () => {
    const client = fakeClient(true, () =>
      Promise.resolve({ products: [product('FY_ANNUAL', 99_999)] })
    );
    await expect(new BrandPerksService(client).perCupCents()).resolves.toBe(0);

    const missing = fakeClient(true, () => Promise.resolve({ products: [product('FY_MONTH', 0)] }));
    await expect(new BrandPerksService(missing).perCupCents()).resolves.toBe(0);
  });

  it('CRM 失败时退避重试：无历史值按 0，有历史值沿用旧值', async () => {
    const client = fakeClient(true, () => Promise.reject(new Error('ECONNREFUSED')));
    const perks = new BrandPerksService(client);

    await expect(perks.perCupCents()).resolves.toBe(0);
    now += 5_000;
    await expect(perks.perCupCents()).resolves.toBe(0);
    expect(client.products).toHaveBeenCalledTimes(1);

    client.products.mockImplementationOnce(() =>
      Promise.resolve({ products: [product('FY_ANNUAL', 200)] })
    );
    now += 6_000;
    await expect(perks.perCupCents()).resolves.toBe(200);

    now += 61_000;
    client.products.mockRejectedValueOnce(new Error('timeout'));
    await expect(perks.perCupCents()).resolves.toBe(200);
  });
});