/**
 * 运营台统一导航。
 *
 * 门店营业与经营管理合并为一套侧边栏，用一级分组区分；
 * 真正的可见范围由角色权限决定（无权限的条目不渲染，整组为空时该分组标题也不出现）。
 * key 同时是路由路径（去掉前导斜杠），所以 store/ 与 admin/ 两段路由保持不变。
 */
import type { IconName } from '../components/Icons';

export type OpsGroup = '门店营业' | '经营管理';

export type OpsNavItem = {
  /** 路由路径，如 store/workbench、admin/overview */
  key: string;
  label: string;
  icon: IconName;
  perm: string;
  group: OpsGroup;
};

export const OPS_NAV: OpsNavItem[] = [
  { key: 'store/workbench', label: '营业台', icon: 'grid', perm: 'pos:use', group: '门店营业' },
  { key: 'store/assisted', label: '帮客人点单', icon: 'plus', perm: 'pos:use', group: '门店营业' },
  { key: 'store/retail', label: '零售提取', icon: 'bag', perm: 'retail:handover', group: '门店营业' },
  { key: 'store/orders', label: '订单记录', icon: 'receipt', perm: 'order:view', group: '门店营业' },
  { key: 'store/inventory', label: '本店在售', icon: 'tray', perm: 'store:stock', group: '门店营业' },
  { key: 'store/losses', label: '报损登记', icon: 'alert', perm: 'loss:report', group: '门店营业' },
  { key: 'store/devices', label: '本店设备', icon: 'printer', perm: 'store:device', group: '门店营业' },
  { key: 'admin/overview', label: '经营概览', icon: 'chart', perm: 'dashboard:view', group: '经营管理' },
  { key: 'admin/finance', label: '财务流水', icon: 'coin', perm: 'finance:view', group: '经营管理' },
  { key: 'admin/profit', label: '门店利润', icon: 'sliders', perm: 'dashboard:profit', group: '经营管理' },
  { key: 'admin/expenses', label: '运营费用', icon: 'receipt', perm: 'finance:view', group: '经营管理' },
  { key: 'admin/approvals', label: '审批中心', icon: 'check', perm: 'approval:view', group: '经营管理' },
  { key: 'admin/losses', label: '报损与损耗', icon: 'alert', perm: 'loss:view', group: '经营管理' },
  { key: 'admin/coupons', label: '优惠券', icon: 'megaphone', perm: 'coupon:view', group: '经营管理' },
  { key: 'admin/products', label: '商品目录', icon: 'tray', perm: 'product:view', group: '经营管理' },
  { key: 'admin/mappings', label: '原料映射', icon: 'box', perm: 'mapping:view', group: '经营管理' },
  { key: 'admin/stores', label: '门店配置', icon: 'store', perm: 'store:config', group: '经营管理' },
  { key: 'admin/staff', label: '账号管理', icon: 'users', perm: 'rbac:view', group: '经营管理' },
  { key: 'admin/roles', label: '角色权限', icon: 'sliders', perm: 'rbac:view', group: '经营管理' },
  // 操作记录只保留一个入口：后端按账号门店范围自动过滤，门店账号看到的就是本店记录。
  { key: 'admin/logs', label: '操作记录', icon: 'list', perm: 'log:view', group: '经营管理' }
];

/** 按权限过滤出当前账号可见的菜单。 */
export const visibleNav = (can: (permission: string) => boolean): OpsNavItem[] =>
  OPS_NAV.filter((item) => can(item.perm));

/** 总部岗位标志权限：有其中之一的账号默认落在经营概览。 */
const HQ_PERMS = ['finance:view', 'product:view', 'store:config', 'rbac:view'];

/**
 * 登录后的默认落地页（登录页与 /staff 共用同一条规则）：
 * 总部岗位先进经营概览，门店岗位先进营业台，都没有则取第一个可见菜单。
 */
export const defaultLanding = (can: (permission: string) => boolean): string | null => {
  const nav = visibleNav(can);
  if (!nav.length) return null;
  const prefer = (key: string) => nav.find((item) => item.key === key);
  const hq = HQ_PERMS.some((perm) => can(perm)) ? prefer('admin/overview') : undefined;
  const target = hq || prefer('store/workbench') || nav[0];
  return `/${target.key}`;
};
