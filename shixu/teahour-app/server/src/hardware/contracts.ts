export type DeviceStatus = {
  online: boolean;
  mode: string;
  detail?: string;
};

export type CupLabelPayload = {
  label: string;
  orderNumber: string;
  storeName: string;
  productName: string;
  temp: string | null;
  ice: string | null;
  cupIndex: number;
  cupTotal: number;
  printedAt: string;
};

export type PrintJobPayload = {
  orderId: string;
  orderNumber: string;
  storeId: string;
  labels: CupLabelPayload[];
  reprint: boolean;
};

export type PrintResult = {
  ok: boolean;
  providerRef?: string;
  error?: string;
};

export interface LabelPrinter {
  readonly name: string;
  readonly mode: string;
  print(job: PrintJobPayload): Promise<PrintResult>;
  status(): Promise<DeviceStatus>;
}

export type BrewCommand = {
  orderId: string;
  label: string;
  productId: string;
  productName: string;
  doseGrams: number;
  temp: string | null;
};

export type BrewResult = {
  accepted: boolean;
  machineId?: string;
  detail?: string;
};

export interface TeaMachineAdapter {
  readonly name: string;
  readonly mode: string;
  status(): Promise<Array<DeviceStatus & { id: string; kind: string }>>;
  brew(command: BrewCommand): Promise<BrewResult>;
}

export type PaymentRequest = {
  amountCents: number;
  method: 'wechat' | 'alipay' | 'cash' | 'platform';
  reference: string;
  metadata?: Record<string, unknown>;
};

export type PaymentResult = {
  ok: boolean;
  providerRef?: string;
  error?: string;
  paidAt?: number;
};

export type RefundRequest = {
  paymentRef: string;
  amountCents: number;
  reference: string;
};

export interface PaymentGateway {
  readonly name: string;
  readonly mode: string;
  charge(request: PaymentRequest): Promise<PaymentResult>;
  refund(request: RefundRequest): Promise<PaymentResult>;
  status(): Promise<DeviceStatus>;
}

export type PlatformOrder = {
  externalId: string;
  storeId: string;
  channel: 'meituan' | 'taobao';
  items: Array<{ productId: string; qty: number; temp?: string; ice?: string }>;
  totalCents: number;
  createdAt: number;
};

export interface PlatformConnector {
  readonly name: string;
  readonly mode: string;
  pullOrders(since: number): Promise<PlatformOrder[]>;
  acknowledge(externalId: string): Promise<boolean>;
}

export type MemberBenefit = {
  code: string;
  tier: 'annual' | 'guest';
  discountPerCupCents: number;
  name?: string;
};

export interface MemberProvider {
  readonly name: string;
  readonly mode: string;
  verify(code: string): Promise<MemberBenefit | null>;
}
