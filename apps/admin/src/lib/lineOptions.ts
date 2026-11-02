export const ICE_OPTIONS = ['标准冰', '少冰', '去冰'] as const;

export type LineOptions = { temp: string | null; ice: string | null };

type ProductOptions = {
  temps?: string[] | null;
  ice?: boolean | null;
};

const temperatures = (product: ProductOptions) =>
  product.temps && product.temps.length ? product.temps : ['热'];

const isIce = (value: string | null | undefined): value is (typeof ICE_OPTIONS)[number] =>
  Boolean(value) && (ICE_OPTIONS as readonly string[]).includes(value as string);

/**
 * 温冰组合的唯一口径（与后端 normalizeTeaOptions 对齐）：
 * 热饮不显示也不保存冰量；冰饮默认标准冰；非法旧值回落到商品可选温度。
 */
export function resolveLineOptions(
  product: ProductOptions,
  temp?: string | null,
  ice?: string | null
): LineOptions {
  const temps = temperatures(product);
  const nextTemp = temp && temps.includes(temp) ? temp : temps.includes('热') ? '热' : temps[0];
  if (!product.ice || nextTemp === '热') return { temp: nextTemp, ice: null };
  return { temp: nextTemp, ice: isIce(ice) ? ice : '标准冰' };
}

/** 切换温度：选热立即清空冰量，切回冰饮恢复标准冰或保留合法冰量。 */
export function changeLineTemp(
  product: ProductOptions,
  temp: string,
  currentIce?: string | null
): LineOptions {
  return resolveLineOptions(product, temp, currentIce);
}
