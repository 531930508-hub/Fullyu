import type { Customer, Order, OrderItem, OrderUnit, Product, Store } from '@prisma/client';
import type { CustomerContext, StaffContext } from './auth.types';
import { assetUrl } from './assets';

const ms = (value: Date | null | undefined): number | null => (value ? value.getTime() : null);

/** 生日对外统一输出 yyyy-MM-dd，避免时区把日期推前一天。 */
const dateOnly = (value: Date | null | undefined): string | null => {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const defaultAvatarUrl = (key: string | null | undefined): string | null => {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  return assetUrl(key);
};

/** 商品图：库里存 uploads 下的相对 key；空值表示由小程序回退到内置插画。 */
export const productImageUrl = (key: string | null | undefined): string => {
  if (!key) return '';
  if (/^https?:\/\//i.test(key)) return key;
  return assetUrl(key);
};

export const mapStore = (row: Store) => ({
  id: row.id,
  city: row.city,
  cityEn: row.cityEn,
  name: row.name,
  nameEn: row.nameEn,
  short: row.short,
  address: row.address,
  addressEn: row.addressEn,
  lat: row.lat,
  lng: row.lng,
  open: row.open,
  retailPickup: row.retailPickup,
  hours: row.hours,
  printerStatus: row.printerStatus,
  channels: JSON.parse(row.channelsJson) as Record<string, boolean>,
  positions: JSON.parse(row.positionsJson) as string[],
  waitMinutes: row.waitMinutes
});

export const mapProduct = (row: Product) => ({
  id: row.id,
  name: row.name,
  nameEn: row.nameEn,
  categoryId: row.categoryId,
  series: row.series,
  kind: row.kind,
  priceCents: row.priceCents,
  costCents: row.costCents,
  doseGrams: row.doseG,
  status: row.status,
  temps: JSON.parse(row.tempsJson) as string[],
  ice: row.ice,
  memberEligible: row.memberEligible,
  desc: row.descZh,
  descEn: row.descEn,
  spec: row.specZh,
  specEn: row.specEn,
  tag: row.tagZh,
  tagEn: row.tagEn,
  unit: row.unitZh,
  unitEn: row.unitEn,
  imageUrl: productImageUrl(row.imageUrl),
  sortOrder: row.sortOrder,
  updatedAt: row.updatedAt.getTime()
});

/** 顾客端公共商品视图：剥离成本与投料等内部经营字段（SEC-02），只面向总部与门店后台输出完整字段。 */
export const mapPublicProduct = (row: Product) => {
  const { costCents: _costCents, doseGrams: _doseGrams, sortOrder: _sortOrder, ...publicFields } = mapProduct(row);
  return publicFields;
};

/** 顾客端订单视图：订单项剥离成本；营业台与总部视图仍用 mapOrder 保留完整成本。 */
export const mapPublicOrder = <T extends { items: Array<{ costCents?: number }> }>(order: T) => ({
  ...order,
  items: order.items.map(({ costCents: _costCents, ...rest }) => rest)
});

export const mapOrder = (
  row: Order,
  items: OrderItem[] = [],
  units: OrderUnit[] = [],
  storeName?: string
) => ({
  id: row.id,
  number: row.number,
  business: row.business,
  storeId: row.storeId,
  storeName: storeName || row.storeId,
  channel: row.channel,
  type: row.type,
  seat: row.seat,
  status: row.status,
  paymentStatus: row.paymentStatus,
  totalCents: row.totalCents,
  refundedCents: row.refundedCents,
  pickupCode: row.pickupCode,
  pickupStoreId: row.pickupStoreId,
  printStatus: row.printStatus,
  parentOrderId: row.parentOrderId,
  note: row.note,
  couponId: row.couponId,
  couponTitle: row.couponTitle,
  couponDiscountCents: row.couponDiscountCents,
  customerId: row.customerId,
  ownerKind: row.ownerKind,
  createdBy: row.createdBy,
  paymentRef: row.paymentRef,
  paymentMethod: row.paymentMethod,
  preparedAt: ms(row.preparedAt),
  createdAt: row.createdAt.getTime(),
  paidAt: ms(row.paidAt),
  deliveredAt: ms(row.deliveredAt),
  refundPending: row.refundPending,
  items: items.map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.name,
    nameEn: item.nameEn,
    kind: item.kind,
    series: item.series,
    qty: item.qty,
    refundedQty: item.refundedQty,
    remainingQty: item.qty - item.refundedQty,
    unitPriceCents: item.unitPriceCents,
    totalCents: item.totalCents,
    costCents: item.costCents,
    temp: item.temp,
    ice: item.ice
  })),
  units: units.map((unit) => ({
    id: unit.id,
    itemId: unit.itemId,
    label: unit.label,
    status: unit.status,
    scannedAt: ms(unit.scannedAt)
  })),
  cupTotal: units.length,
  cupScanned: units.filter((u) => u.status === 'scanned').length
});

export const mapCustomer = (
  customer: Pick<Customer, 'id' | 'memberCode' | 'name' | 'phone'> &
    Partial<Pick<Customer, 'avatarKey' | 'gender' | 'birthday'>>,
  /** 头像 key → 可访问地址；默认用本地静态资源规则，接对象存储时传入 provider.resolve。 */
  resolveAvatar: (key: string | null | undefined) => string | null = defaultAvatarUrl
) => ({
  id: customer.id,
  memberCode: customer.memberCode,
  name: customer.name,
  phone: customer.phone,
  avatarUrl: resolveAvatar(customer.avatarKey),
  gender: customer.gender ?? null,
  birthday: dateOnly(customer.birthday)
});

export const mapCustomerContext = (customer: CustomerContext) => ({
  id: customer.id,
  memberCode: customer.memberCode,
  name: customer.name,
  phone: customer.phone
});

export const mapStaffSummary = (user: StaffContext) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  active: user.active,
  allStores: user.allStores,
  storeIds: user.storeIds,
  roles: user.roles.map((r) => ({ id: r.id, name: r.name, scope: r.scope })),
  permissions: Array.from(user.perms)
});
