/** 摄像头/扫码枪读到的原文可能带前后空白、链接或附带说明，这里只做去噪，不改业务值。 */
const clean = (text: string) => String(text == null ? '' : text).trim();

/** 会员码形如 TH-261029-0001；从链接或文本中提取，识别不到时返回空串。 */
export function memberCodeFromScan(text: string) {
  const match = clean(text).toUpperCase().match(/TH-[A-Z0-9]+(?:-[A-Z0-9]+)*/);
  return match ? match[0] : '';
}

/** 门店杯贴/提货码：提货码固定 4 位数字，数字不足时不猜测。 */
export function pickupCodeFromScan(text: string) {
  const digits = clean(text).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}
