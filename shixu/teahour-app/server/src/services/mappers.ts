import type { CustomerUser, StaffUser } from '../lib/auth.js';

export type StoreRow = {
  id: string;
  city: string;
  city_en: string;
  name: string;
  name_en: string;
  short: string;
  address: string;
  address_en: string;
  lat: number;
  lng: number;
  open: number;
  retail_pickup: number;
  hours: string;
  printer_status: string;
  channels_json: string;
  positions_json: string;
  wait_minutes: number;
};

export type ProductRow = {
  id: string;
  name: string;
  name_en: string;
  category_id: string;
  series: string;
  kind: string;
  price_cents: number;
  cost_cents: number;
  dose_g: number;
  status: string;
  temps_json: string;
  ice: number;
  member_eligible: number;
  desc_zh: string;
  desc_en: string;
  spec_zh: string;
  spec_en: string;
  tag_zh: string;
  tag_en: string;
  unit_zh: string;
  unit_en: string;
  updated_at: number;
};

export type OrderRow = {
  id: string;
  number: string;
  business: string;
  store_id: string;
  channel: string;
  type: string;
  seat: string | null;
  status: string;
  payment_status: string;
  total_cents: number;
  refunded_cents: number;
  pickup_code: string | null;
  pickup_store_id: string | null;
  print_status: string;
  parent_order_id: string | null;
  note: string;
  customer_id: string | null;
  owner_kind: string;
  created_by: string | null;
  payment_ref: string | null;
  payment_method: string | null;
  prepared_at: number | null;
  created_at: number;
  paid_at: number | null;
  delivered_at: number | null;
  refund_pending: number;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  name_en: string;
  kind: string;
  series: string;
  qty: number;
  refunded_qty: number;
  unit_price_cents: number;
  total_cents: number;
  cost_cents: number;
  temp: string | null;
  ice: string | null;
};

export type UnitRow = {
  id: string;
  order_id: string;
  item_id: string;
  label: string;
  status: string;
  scanned_at: number | null;
};

export const mapStore = (row: StoreRow) => ({
  id: row.id,
  city: row.city,
  cityEn: row.city_en,
  name: row.name,
  nameEn: row.name_en,
  short: row.short,
  address: row.address,
  addressEn: row.address_en,
  lat: row.lat,
  lng: row.lng,
  open: !!row.open,
  retailPickup: !!row.retail_pickup,
  hours: row.hours,
  printerStatus: row.printer_status,
  channels: JSON.parse(row.channels_json),
  positions: JSON.parse(row.positions_json),
  waitMinutes: row.wait_minutes
});

export const mapProduct = (row: ProductRow) => ({
  id: row.id,
  name: row.name,
  nameEn: row.name_en,
  categoryId: row.category_id,
  series: row.series,
  kind: row.kind,
  priceCents: row.price_cents,
  costCents: row.cost_cents,
  doseGrams: row.dose_g,
  status: row.status,
  temps: JSON.parse(row.temps_json),
  ice: !!row.ice,
  memberEligible: !!row.member_eligible,
  desc: row.desc_zh,
  descEn: row.desc_en,
  spec: row.spec_zh,
  specEn: row.spec_en,
  tag: row.tag_zh,
  tagEn: row.tag_en,
  unit: row.unit_zh,
  unitEn: row.unit_en,
  updatedAt: row.updated_at
});

export const mapOrder = (
  row: OrderRow,
  items: OrderItemRow[] = [],
  units: UnitRow[] = [],
  storeName?: string
) => ({
  id: row.id,
  number: row.number,
  business: row.business,
  storeId: row.store_id,
  storeName: storeName || row.store_id,
  channel: row.channel,
  type: row.type,
  seat: row.seat,
  status: row.status,
  paymentStatus: row.payment_status,
  totalCents: row.total_cents,
  refundedCents: row.refunded_cents,
  pickupCode: row.pickup_code,
  pickupStoreId: row.pickup_store_id,
  printStatus: row.print_status,
  parentOrderId: row.parent_order_id,
  note: row.note,
  customerId: row.customer_id,
  ownerKind: row.owner_kind,
  createdBy: row.created_by,
  paymentRef: row.payment_ref,
  paymentMethod: row.payment_method,
  preparedAt: row.prepared_at,
  createdAt: row.created_at,
  paidAt: row.paid_at,
  deliveredAt: row.delivered_at,
  refundPending: !!row.refund_pending,
  items: items.map((item) => ({
    id: item.id,
    productId: item.product_id,
    name: item.name,
    nameEn: item.name_en,
    kind: item.kind,
    series: item.series,
    qty: item.qty,
    refundedQty: item.refunded_qty,
    remainingQty: item.qty - item.refunded_qty,
    unitPriceCents: item.unit_price_cents,
    totalCents: item.total_cents,
    costCents: item.cost_cents,
    temp: item.temp,
    ice: item.ice
  })),
  units: units.map((unit) => ({
    id: unit.id,
    itemId: unit.item_id,
    label: unit.label,
    status: unit.status,
    scannedAt: unit.scanned_at
  })),
  cupTotal: units.length,
  cupScanned: units.filter((u) => u.status === 'scanned').length
});

export const mapCustomer = (customer: CustomerUser) => ({
  id: customer.id,
  memberCode: customer.memberCode,
  name: customer.name,
  phone: customer.phone
});

export const mapStaffSummary = (user: StaffUser) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  active: user.active,
  allStores: user.allStores,
  storeIds: user.storeIds,
  roles: user.roles.map((r) => ({ id: r.id, name: r.name, scope: r.scope })),
  permissions: Array.from(user.perms)
});
