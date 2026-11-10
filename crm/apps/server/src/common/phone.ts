/**
 * 手机号统一口径：
 * - 中国大陆存 11 位（不带 +86），输入兼容 +86 / 86 / 0086；
 * - 境外存 E.164（+ 国家码 + 号码），兼容 00 国际前缀、空格、横线、括号；
 * - 常见国家/地区的 0 长途前缀在归一化时去掉，保证微信取号与历史导入能落到同一会员；
 * - 非空但无法识别的号码保留为数字串，绝不静默变成空手机号。
 */
const CN_MOBILE = /^1\d{10}$/;

/** 这些国家码后的 0 是长途接入前缀，不是号码的一部分（意大利 +39 等例外）。 */
const TRUNK_ZERO_COUNTRY_CODES = [
  '886',
  '880',
  '852',
  '853',
  '971',
  '972',
  '966',
  '420',
  '421',
  '49',
  '44',
  '33',
  '34',
  '31',
  '32',
  '41',
  '43',
  '45',
  '46',
  '47',
  '48',
  '30',
  '36',
  '40',
  '90',
  '91',
  '92',
  '93',
  '94',
  '95',
  '98',
  '61',
  '64',
  '81',
  '82',
  '84',
  '86',
  '66',
  '60',
  '62',
  '63',
  '65',
  '55',
  '52',
  '54',
  '56',
  '57',
  '58',
  '51',
  '53',
  '27',
  '20',
  '7'
].sort((a, b) => b.length - a.length);

export function normalizePhone(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  const original = String(input).trim();
  if (!original) return null;

  // 全角＋、空格、横线、括号、点号都不参与号码本身。
  const cleaned = original.replace(/＋/g, '+').replace(/[\s\-().]/g, '');
  let plus = cleaned.startsWith('+');
  let digits = cleaned.replace(/\D/g, '');
  if (!digits) return null;

  if (!plus && digits.startsWith('00')) {
    plus = true;
    digits = digits.slice(2);
  }
  if (!digits) return null;

  if (!plus) {
    if (digits.startsWith('86') && CN_MOBILE.test(digits.slice(2))) return digits.slice(2);
    if (CN_MOBILE.test(digits)) return digits;
    // 不带 + 的境外号码无法可靠判断国家码，保留原数字，至少不丢号码。
    return digits;
  }

  digits = digits.replace(/^\+/, '').replace(/^00/, '');
  if (digits.startsWith('86') && CN_MOBILE.test(digits.slice(2))) return digits.slice(2);

  const countryCode = TRUNK_ZERO_COUNTRY_CODES.find((code) => digits.startsWith(code));
  if (!countryCode) return `+${digits}`;

  const national = digits.slice(countryCode.length).replace(/^0+/, '') || digits.slice(countryCode.length);
  return `+${countryCode}${national}`;
}

/** 后台按手机号搜索：大陆号码同时匹配 11 位与 +86 两种写法。 */
export function phoneSearchTerms(query: string): string[] {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const terms = new Set<string>([raw]);
  const normalized = normalizePhone(raw);
  if (normalized && normalized.length >= 4) {
    terms.add(normalized);
    if (normalized.startsWith('+86')) terms.add(normalized.slice(3));
    if (CN_MOBILE.test(normalized)) terms.add(`+86${normalized}`);
  }
  return [...terms];
}

/** 会员端展示脱敏：大陆 138****8000，境外 +852****4567。 */
export const maskPhone = (phone: string | null): string | null => {
  if (!phone) return null;
  if (CN_MOBILE.test(phone)) return `${phone.slice(0, 3)}****${phone.slice(7)}`;
  if (/^\+\d{7,15}$/.test(phone)) {
    const digits = phone.slice(1);
    return `+${digits.slice(0, Math.min(3, Math.max(1, digits.length - 4)))}****${digits.slice(-4)}`;
  }
  return phone;
};
