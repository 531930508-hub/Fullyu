/**
 * 时叙对外接口契约。
 *
 * 这里是业务系统与外部服务商之间唯一的约定层：业务代码只认这些类型，不认厂商。
 * 对接团队实现真实渠道时，只需要实现对应接口并在 providers/live 注册，不改业务代码。
 */

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

export type PaymentChannel = 'wechat' | 'alipay';

export type PaymentState = 'paid' | 'unpaid' | 'pending' | 'processing' | 'failed' | 'closed';

export type PaymentRequest = {
  amountCents: number;
  method: PaymentChannel | 'cash' | 'platform';
  reference: string;
  metadata?: Record<string, unknown>;
};

export type PaymentResult = {
  ok: boolean;
  providerRef?: string;
  error?: string;
  paidAt?: number;
};

/** 退款结果：processing 表示渠道已受理但尚未出账，必须保持占用等待回调/查询收敛。 */
export type PaymentRefundResult = PaymentResult & {
  status?: 'succeeded' | 'processing';
};

export type RefundRequest = {
  paymentRef: string;
  amountCents: number;
  reference: string;
  /** 原订单所属门店：服务商模式下退款必须打到同一个子商户。 */
  storeId?: string;
  /** 原交易发起时间（毫秒），部分渠道查询/退款需要与原交易日期对应。 */
  requestedAt?: number;
};

/**
 * 支付渠道异步通知（回调）。
 * rawBody 是未经解析的原始字节字符串：微信、支付宝的签名校验都必须用它，不能用重新序列化的 JSON。
 */
export type PaymentCallback = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  body: unknown;
};

export type PaymentCallbackResult = {
  ok: boolean;
  /** payment=支付结果；refund=退款结果。缺省按 payment 处理，兼容旧渠道。 */
  kind?: 'payment' | 'refund';
  /** 已完成的业务侧单号，通常是我们的 orderId（退款为 RefundIntent.id）；对不上就不落账。 */
  reference?: string;
  providerRef?: string;
  paidAt?: number;
  /** 渠道实收金额（分），业务层必须与订单金额核对后才能落账。 */
  amountCents?: number;
  /** 渠道商户号（服务商模式为子商户 huifu_id），业务层必须与门店配置核对。 */
  merchantId?: string;
  method?: PaymentChannel;
  /** 支付结果；paid 之外的状态绝不落账。 */
  status?: PaymentState;
  /** 退款结果；processing 保持占用等待收敛。 */
  refundStatus?: 'succeeded' | 'processing' | 'failed';
  error?: string;
};

export interface PaymentGateway {
  readonly name: string;
  readonly mode: string;
  /** 展示名，供状态页与后台收款说明使用。 */
  readonly displayName?: string;
  /**
   * true 表示在线支付必须「先建未支付单，再预下单/扫码，最后由回调落账」；
   * 此时订单层不得调用同步 charge，否则会出现「渠道未扣款、订单却已支付」。
   */
  readonly asyncPayments?: boolean;
  /** 渠道要求异步通知原样应答的纯文本（如汇付的 success）。 */
  readonly callbackAck?: string;
  charge(request: PaymentRequest): Promise<PaymentResult>;
  refund(request: RefundRequest): Promise<PaymentRefundResult>;
  status(): Promise<DeviceStatus>;
  /**
   * 处理渠道回调。未实现表示该渠道不回调（如现金、纯线下），
   * 服务端 POST /api/hooks/payment/:provider 会返回 501。
   */
  handleCallback?(request: PaymentCallback): Promise<PaymentCallbackResult>;
  /** 小程序 JSAPI 预下单；不支持小程序支付的渠道可不实现。 */
  prepay?(request: PrepayRequest): Promise<PrepayResult>;
  /** 后台展示收款码（顾客扫门店码）。 */
  nativePay?(request: NativePayRequest): Promise<NativePayResult>;
  /** 后台扫顾客付款码（门店扫顾客码）。 */
  micropay?(request: MicropayRequest): Promise<MicropayResult>;
  /** 主动查询支付结果，用于回调延迟或断网恢复。 */
  query?(request: PaymentQueryRequest): Promise<PaymentQueryResult>;
  /** 服务商模式下按门店解析子商户号；无此能力或未配置时返回空。 */
  merchantFor?(storeId: string): string;
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

/** 小程序登录态：真实实现为 wx.login code → auth.code2Session。 */
export type MiniProgramSession = {
  openId: string;
  unionId?: string;
  sessionKey?: string;
};

/** 真实实现需用 session_key 解密 getPhoneNumber 的 encryptedData/iv。 */
export type PhoneNumberRequest = {
  openId: string;
  code?: string;
  encryptedData?: string;
  iv?: string;
};

export type PhoneNumberResult = {
  phone: string;
  countryCode?: string;
};

/** 真实实现为 JSAPI 下单（mchid/商户证书/回调验签），返回可直接交给 wx.requestPayment 的参数。 */
export type PrepayRequest = {
  openId: string;
  orderId: string;
  orderNumber: string;
  amountCents: number;
  description: string;
  /** 下单门店（零售为 brand），服务商模式据此选择子商户号。 */
  storeId?: string;
  /** 微信小程序 AppID；服务商模式下是子商户绑定的 AppID。 */
  subAppId?: string;
  /** 支付渠道的客户端 IP，用于风控字段。 */
  clientIp?: string;
  /** 覆盖默认异步通知地址（一般不需要）。 */
  notifyUrl?: string;
};

export type NativePayRequest = {
  orderId: string;
  amountCents: number;
  description: string;
  storeId: string;
  method: PaymentChannel;
  clientIp?: string;
  notifyUrl?: string;
};

export type NativePayResult = {
  ok: boolean;
  error?: string;
  /** 交给顾客扫码的渠道收款码内容（微信/支付宝各自的二维码）。 */
  qrCode?: string;
  providerRef?: string;
  status?: 'pending' | 'paid' | 'processing';
};

export type MicropayRequest = {
  orderId: string;
  amountCents: number;
  description: string;
  storeId: string;
  method: PaymentChannel;
  /** 顾客付款码（微信 10–15 开头，支付宝 25–30 开头），由渠道自行识别。 */
  authCode: string;
  clientIp?: string;
  notifyUrl?: string;
};

export type MicropayResult = {
  ok: boolean;
  error?: string;
  status: 'paid' | 'processing' | 'failed';
  providerRef?: string;
  paidAt?: number;
};

export type PaymentQueryRequest = {
  orderId: string;
  storeId: string;
  method: PaymentChannel;
  /** 原下单时间：查询接口需要与原交易日期对应。 */
  requestedAt?: number;
};

export type PaymentQueryResult = {
  ok: boolean;
  error?: string;
  status: PaymentState;
  providerRef?: string;
  paidAt?: number;
};

/**
 * 分享海报用小程序码：微信扫码后直接打开指定页面。
 * scene 最多 32 个可见字符，用来携带轻量标识；页面路径必须是已发布页面。
 */
export type ShareCodeRequest = {
  page?: string;
  scene?: string;
  width?: number;
};

export type ShareCodeResult = {
  contentType: 'image/png';
  /** 不含 data: 前缀的 base64，前端可直接拼成图片地址或画进海报。 */
  base64: string;
  page: string;
  scene: string;
};

export type PrepayResult = {
  ok: boolean;
  error?: string;
  payment?: {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: 'RSA' | 'MD5';
    paySign: string;
  };
};

export interface MiniProgramAuthProvider {
  readonly name: string;
  readonly mode: string;
  readonly appId: string;
  /**
   * prepay 实际使用的模式。登录能力与支付渠道可以分别接入：
   * 例如微信登录已接 live、支付仍是 mock 时，mode=live 而 prepayMode=mock，
   * 调用方必须以 prepayMode 判断支付参数是否可交给 wx.requestPayment。
   */
  readonly prepayMode?: string;
  code2Session(code: string): Promise<MiniProgramSession>;
  phoneNumber(request: PhoneNumberRequest): Promise<PhoneNumberResult>;
  prepay(request: PrepayRequest): Promise<PrepayResult>;
  status(): Promise<DeviceStatus>;
  /**
   * 生成分享用小程序码。mock 适配层没有微信开放接口，可以不实现；
   * 调用方必须按「未实现」处理，不能拿普通二维码冒充小程序码。
   */
  shareCode?(request: ShareCodeRequest): Promise<ShareCodeResult>;
}

/** 头像存储：内置实现落本地磁盘；真实部署替换为对象存储（OSS/COS）签名直传。 */
export type AvatarUploadRequest = {
  customerId: string;
  /** 不含 data: 前缀的 base64 内容 */
  base64: string;
  contentType: string;
};

export type AvatarUploadResult = {
  key: string;
  url: string;
};

export interface AvatarStorageProvider {
  readonly name: string;
  readonly mode: string;
  put(request: AvatarUploadRequest): Promise<AvatarUploadResult>;
  /** 由 key 还原可访问地址；key 为空返回 null。 */
  resolve(key: string | null | undefined): string | null;
}

/** 跨系统资料同步：由第三方用户中心承接。 */
export type ProfileSnapshot = {
  customerId: string;
  phone: string | null;
  name: string;
  gender: number | null;
  birthday: string | null;
  avatarKey: string | null;
};

export interface ProfileSyncProvider {
  readonly name: string;
  readonly mode: string;
  pushProfile(snapshot: ProfileSnapshot): Promise<void>;
  pullProfile(phone: string): Promise<Partial<ProfileSnapshot> | null>;
}

/** 服务启动后由 createIntegrations 组装出来的一整套对外能力。 */
export type IntegrationKey =
  | 'printer'
  | 'teaMachine'
  | 'payment'
  | 'platform'
  | 'member'
  | 'wechat'
  | 'avatar'
  | 'profileSync';

export type Integrations = {
  printer: LabelPrinter;
  teaMachine: TeaMachineAdapter;
  payment: PaymentGateway;
  platform: PlatformConnector;
  member: MemberProvider;
  wechat: MiniProgramAuthProvider;
  avatar: AvatarStorageProvider;
  profileSync: ProfileSyncProvider;
};

/**
 * 对接模式：
 * - mock：内置模拟实现，只用于本地开发与验收；
 * - live：真实厂商实现，必须在 providers/live 注册；
 * - disabled：显式关闭。所有操作诚实失败，绝不静默回落到 mock 冒充真实能力。
 */
export type IntegrationsMode = 'mock' | 'live' | 'disabled';

/** 可按渠道独立配置模式的外部通道；avatar/profileSync 是本地能力，跟随整体配置。 */
export type ExternalChannelKey = 'printer' | 'teaMachine' | 'payment' | 'platform' | 'member' | 'wechat';

export type IntegrationsConfig = {
  /** 全局模式，也是未单独配置的渠道的默认模式。 */
  mode: IntegrationsMode;
  /** 每个外部通道的实际生效模式（全局模式 + 按渠道环境变量覆盖后的结果）。 */
  channels: Record<ExternalChannelKey, IntegrationsMode>;
  /** 部署环境标识，只用于状态展示与日志，不影响行为。 */
  env: string;
  wechat: {
    appId: string;
    appSecret?: string;
    mchId?: string;
  };
  /**
   * 汇付天下（斗拱 v2）服务商模式配置。
   * 密钥只从服务器文件读取，绝不写进环境变量明文或源码。
   */
  huifu: {
    sysId?: string;
    productId: string;
    /** 默认子商户号；门店没有单独配置时使用。 */
    huifuId?: string;
    /** 服务商模式下小程序须绑定在子商户下，支付时回传该 AppID。 */
    subAppId?: string;
    privateKeyPath: string;
    publicKeyPath: string;
    /** 部分老回调使用 MD5 密钥；没有该文件时只校验 RSA。 */
    webhookKeyPath?: string;
    privateKey?: string;
    publicKey?: string;
    webhookKey?: string;
    notifyUrl: string;
    apiBase: string;
    /** 门店 → 子商户号映射（JSON）。 */
    storeMerchants: Record<string, string>;
    timeoutMs: number;
  };
  upload: {
    /** 本地实现的落盘根目录（对象存储实现可忽略）。 */
    root: string;
    /** 由存储 key 生成对外可访问地址。 */
    assetUrl: (key: string) => string;
  };
  /**
   * 飞鹅云标签机（杯贴打印，含杯号二维码）。
   * user / UKEY 只从服务器环境变量读取；门店 SN 可单独映射，避免所有店打到同一台机器。
   */
  feie: {
    user?: string;
    ukey?: string;
    /** 默认打印机 SN；门店没有单独配置时使用。 */
    sn?: string;
    /** 门店 ID → 打印机 SN。 */
    storeSn: Record<string, string>;
    apiBase: string;
    timeoutMs: number;
    labelWidthMm: number;
    labelHeightMm: number;
    /** 两张标签纸之间的间距与偏移，形如 2,0（单位 mm）。 */
    labelGap: string;
  };
};
