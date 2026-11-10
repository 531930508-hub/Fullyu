import { describe, expect, test } from 'vitest';
import { isReadyPickup, pickupOrders, pickupTarget, readyFirst } from './pickupOrders';

const MINUTE = 60 * 1000;
const NOW = 1_700_000_000_000;

const order = (id, overrides = {}) => ({
  id,
  business: 'fresh',
  status: 'pending',
  paymentStatus: 'paid',
  createdAt: NOW - 10 * MINUTE,
  preparedAt: NOW - 10 * MINUTE,
  ...overrides
});

describe('pickupOrders', () => {
  test('排除未支付、取消、退款和已完成的订单', () => {
    const list = [
      order('unpaid', { status: 'unpaid', paymentStatus: 'unpaid' }),
      order('cancelled', { status: 'cancelled' }),
      order('refunded', { status: 'refunded' }),
      order('done', { status: 'delivered' }),
      order('brewing')
    ];
    expect(pickupOrders(list, NOW).map((item) => item.id)).toEqual(['brewing']);
  });

  test('茶饮取制作中/已出餐，零售取待提货/待领取', () => {
    const list = [
      order('tea-brewing'),
      order('tea-ready', { status: 'ready' }),
      order('retail-awaiting', { business: 'retail', status: 'awaiting' }),
      order('retail-ready', { business: 'retail', status: 'ready' }),
      order('retail-pending', { business: 'retail', status: 'pending' })
    ];
    expect(pickupOrders(list, NOW).map((item) => item.id)).toEqual([
      'tea-ready',
      'retail-awaiting',
      'retail-ready',
      'tea-brewing'
    ]);
  });

  test('可以取茶的订单优先，同优先级按最新下单排序', () => {
    const list = [
      order('old-brewing', { createdAt: NOW - 40 * MINUTE }),
      order('new-brewing', { createdAt: NOW - 5 * MINUTE }),
      order('old-ready', { status: 'ready', createdAt: NOW - 50 * MINUTE, preparedAt: NOW - 50 * MINUTE }),
      order('new-ready', { status: 'ready', createdAt: NOW - 30 * MINUTE, preparedAt: NOW - 30 * MINUTE })
    ];
    expect(pickupOrders(list, NOW).map((item) => item.id)).toEqual([
      'new-ready',
      'old-ready',
      'new-brewing',
      'old-brewing'
    ]);
  });

  test('只显示近一小时内出餐的茶饮，早先的已出餐不再占首页', () => {
    const list = [
      order('fresh-ready', { status: 'ready', preparedAt: NOW - 30 * MINUTE }),
      order('stale-ready', { status: 'ready', preparedAt: NOW - 61 * MINUTE }),
      order('brewing')
    ];
    expect(pickupOrders(list, NOW).map((item) => item.id)).toEqual(['fresh-ready', 'brewing']);
  });

  test('只有一小时前的已出餐时首页入口清空，不再挂旧取餐号', () => {
    const list = [order('stale-ready', { status: 'ready', preparedAt: NOW - 61 * MINUTE })];
    expect(pickupOrders(list, NOW)).toEqual([]);
  });

  test('缺少出餐时间时按 createdAt 兜底判断新鲜度', () => {
    const list = [
      order('fresh', { status: 'ready', preparedAt: null, createdAt: NOW - 20 * MINUTE }),
      order('stale', { status: 'ready', preparedAt: null, createdAt: NOW - 90 * MINUTE })
    ];
    expect(pickupOrders(list, NOW).map((item) => item.id)).toEqual(['fresh']);
  });

  test('零售待提货不受一小时限制，隔天仍可出示提货码', () => {
    const list = [
      order('retail', {
        business: 'retail',
        status: 'awaiting',
        createdAt: NOW - 27 * 60 * MINUTE,
        preparedAt: null
      })
    ];
    expect(pickupOrders(list, NOW).map((item) => item.id)).toEqual(['retail']);
  });

  test('茶饮制作中超过三小时不再挂首页', () => {
    const list = [
      order('fresh-brewing', { createdAt: NOW - 179 * MINUTE, preparedAt: null }),
      order('stale-brewing', { createdAt: NOW - 181 * MINUTE, preparedAt: null })
    ];
    expect(pickupOrders(list, NOW).map((item) => item.id)).toEqual(['fresh-brewing']);
  });

  test('零售待提货超过四十八小时收起，未超过仍保留', () => {
    const list = [
      order('retail-fresh', { business: 'retail', status: 'awaiting', createdAt: NOW - 47 * 60 * MINUTE, preparedAt: null }),
      order('retail-stale', { business: 'retail', status: 'ready', createdAt: NOW - 49 * 60 * MINUTE, preparedAt: null })
    ];
    expect(pickupOrders(list, NOW).map((item) => item.id)).toEqual(['retail-fresh']);
  });

  test('制作中缺少下单时间按过期处理，避免旧单长期占首页', () => {
    const list = [order('no-created', { createdAt: null, preparedAt: null })];
    expect(pickupOrders(list, NOW)).toEqual([]);
  });

  test('空数据与缺失字段返回空数组', () => {
    expect(pickupOrders([], NOW)).toEqual([]);
    expect(pickupOrders(null, NOW)).toEqual([]);
  });
});

describe('isReadyPickup', () => {
  test('已支付且已出餐的茶、待提货的零售才算可取', () => {
    expect(isReadyPickup(order('ready', { status: 'ready' }))).toBe(true);
    expect(isReadyPickup(order('retail', { business: 'retail', status: 'awaiting' }))).toBe(true);
    expect(isReadyPickup(order('retail-ready', { business: 'retail', status: 'ready' }))).toBe(true);
    expect(isReadyPickup(order('brewing'))).toBe(false);
    expect(isReadyPickup(order('unpaid', { status: 'ready', paymentStatus: 'unpaid' }))).toBe(false);
  });
});

describe('pickupTarget', () => {
  test('只有一单可取时直接打开它，即使还有别的在制作', () => {
    const list = [order('brewing'), order('ready', { status: 'ready' })];
    expect(pickupTarget(list, NOW).id).toBe('ready');
  });

  test('两单以上可取时交给订单列表，不替顾客挑', () => {
    const list = [
      order('ready-a', { status: 'ready' }),
      order('ready-b', { status: 'ready', createdAt: NOW - 5 * MINUTE, preparedAt: NOW - 5 * MINUTE })
    ];
    expect(pickupTarget(list, NOW)).toBeNull();
  });

  test('全部制作中且不止一单时也交给列表', () => {
    expect(pickupTarget([order('a'), order('b')], NOW)).toBeNull();
  });

  test('只有一单制作中时仍可点开看进度', () => {
    expect(pickupTarget([order('brewing')], NOW).id).toBe('brewing');
  });

  test('忽略取消和未支付订单后判断', () => {
    const list = [
      order('cancelled', { status: 'cancelled' }),
      order('unpaid', { status: 'unpaid', paymentStatus: 'unpaid' }),
      order('ready', { status: 'ready' })
    ];
    expect(pickupTarget(list, NOW).id).toBe('ready');
    expect(pickupTarget([order('cancelled', { status: 'cancelled' })], NOW)).toBeNull();
  });

  test('早先已出餐不算目标，当前制作中的单仍可点开', () => {
    const list = [order('stale-ready', { status: 'ready', preparedAt: NOW - 61 * MINUTE }), order('brewing')];
    expect(pickupTarget(list, NOW).id).toBe('brewing');
  });

  test('超过三小时的制作中单也不再作为点击目标', () => {
    const list = [order('stale-brewing', { createdAt: NOW - 181 * MINUTE, preparedAt: null })];
    expect(pickupTarget(list, NOW)).toBeNull();
  });
});

describe('readyFirst', () => {
  test('把已出餐/待提货稳定地提到最前，其余保持原顺序', () => {
    const list = [
      order('a'),
      order('b', { status: 'ready' }),
      order('c'),
      order('d', { business: 'retail', status: 'awaiting' })
    ];
    expect(readyFirst(list).map((item) => item.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(list.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(readyFirst(null)).toEqual([]);
  });

  test('订单列表不过滤早先已出餐，顾客仍可回看回执', () => {
    const list = [order('stale-ready', { status: 'ready', preparedAt: NOW - 120 * MINUTE }), order('brewing')];
    expect(readyFirst(list).map((item) => item.id)).toEqual(['stale-ready', 'brewing']);
  });
});
