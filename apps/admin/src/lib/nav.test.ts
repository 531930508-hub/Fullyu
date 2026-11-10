import { describe, expect, it } from 'vitest';
import { OPS_NAV, defaultLanding, groupNav, groupOf, pinnedNav, visibleNav } from './nav';

const allowAll = () => true;
const canFrom = (perms: string[]) => (permission: string) =>
  perms.includes('*') || perms.includes(permission);

describe('运营台导航分组', () => {
  it('营业台作为一级直达入口，其余 20 个菜单收拢为 5 个分组', () => {
    const nav = visibleNav(allowAll);
    expect(pinnedNav(nav).map((item) => item.key)).toEqual(['store/workbench']);

    const groups = groupNav(nav);
    expect(groups.map((group) => group.group)).toEqual([
      '门店营业',
      '经营分析',
      '运营管理',
      '商品与门店',
      '组织与权限'
    ]);
    expect(groups.reduce((total, group) => total + group.items.length, 0)).toBe(20);
    expect(groups.map((group) => group.items.length)).toEqual([6, 4, 4, 3, 3]);
  });

  it('二级菜单保持原顺序，营业台不再重复出现在门店营业组里', () => {
    const groups = groupNav(visibleNav(allowAll));
    const labels = (group: string) =>
      groups.find((item) => item.group === group)?.items.map((item) => item.label);
    expect(labels('门店营业')).toEqual([
      '帮客人点单',
      '零售提取',
      '订单记录',
      '本店在售',
      '报损登记',
      '本店设备'
    ]);
    expect(labels('经营分析')).toEqual(['经营概览', '财务流水', '门店利润', '运营费用']);
    expect(labels('运营管理')).toEqual(['审批中心', '报损与损耗', '优惠券', '首页内容']);
    expect(labels('商品与门店')).toEqual(['商品目录', '原料映射', '门店配置']);
    expect(labels('组织与权限')).toEqual(['账号管理', '角色权限', '操作记录']);
  });

  it('没有营业台权限时不出现直达入口，也不影响其他菜单', () => {
    const can = (permission: string) => permission === 'dashboard:view';
    expect(pinnedNav(visibleNav(can))).toEqual([]);
    const groups = groupNav(visibleNav(can));
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe('经营分析');
    expect(groups[0].items.map((item) => item.key)).toEqual(['admin/overview']);
  });

  it('所有菜单要么是一级直达，要么落在声明的一级分组内', () => {
    const nav = visibleNav(allowAll);
    const pinnedKeys = pinnedNav(nav).map((item) => item.key);
    const groupedKeys = groupNav(nav).flatMap((group) => group.items.map((item) => item.key));
    const allKeys = [...pinnedKeys, ...groupedKeys];
    expect(new Set(allKeys).size).toBe(OPS_NAV.length);
    expect(allKeys).toHaveLength(OPS_NAV.length);
  });

  it('可以根据当前路由找到所属分组，用于自动展开', () => {
    const nav = visibleNav(allowAll);
    expect(groupOf(nav, 'admin/content')).toBe('运营管理');
    expect(groupOf(nav, 'admin/roles')).toBe('组织与权限');
    expect(groupOf(nav, 'admin/unknown')).toBeUndefined();
    // 营业台是一级直达，不触发任何分组展开。
    expect(groupOf(nav, 'store/workbench')).toBeUndefined();
  });
});

describe('登录后的默认落地页', () => {
  it('总部岗位落在经营概览', () => {
    expect(defaultLanding(canFrom(['*']))).toBe('/admin/overview');
    expect(
      defaultLanding(
        canFrom(['dashboard:view', 'dashboard:profit', 'finance:view', 'finance:export', 'finance:expense'])
      )
    ).toBe('/admin/overview');
    expect(
      defaultLanding(canFrom(['dashboard:view', 'product:view', 'mapping:view', 'store:config']))
    ).toBe('/admin/overview');
  });

  it('有营业台权限的门店岗位落在营业台', () => {
    expect(
      defaultLanding(
        canFrom(['pos:use', 'retail:handover', 'order:view', 'order:refund:request'])
      )
    ).toBe('/store/workbench');
    expect(
      defaultLanding(
        canFrom(['dashboard:view', 'pos:use', 'store:stock', 'loss:report', 'log:view'])
      )
    ).toBe('/store/workbench');
  });

  it('没有营业台权限时落在第一个可见菜单', () => {
    expect(defaultLanding(canFrom(['retail:handover']))).toBe('/store/retail');
    expect(defaultLanding(canFrom(['order:view']))).toBe('/store/orders');
    expect(defaultLanding(canFrom(['order:view', 'retail:handover']))).toBe('/store/retail');
    // 只有财务权限但没有经营概览权限时，进入财务流水而不是空页。
    expect(defaultLanding(canFrom(['finance:view']))).toBe('/admin/finance');
  });

  it('完全没有菜单权限时返回 null', () => {
    expect(defaultLanding(() => false)).toBeNull();
    expect(defaultLanding(canFrom(['product:edit']))).toBeNull();
  });
});
