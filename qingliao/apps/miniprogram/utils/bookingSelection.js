export function canConfirmBooking(loading, selectedTime, slots) {
  return !loading && !!selectedTime && (slots || []).some(slot =>
    slot.time === selectedTime && Number(slot.state) === 1);
}

/**
 * 失败提示的兜底文案需要跟着界面语言走；本模块保持零依赖（测试用 vm 直接执行），
 * 因此翻译函数由调用方以第二参数传入，不传时仍是中文原文。
 */
export function bookingFailureMessage(error, translate) {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && error.message) return error.message;
  const text = '暂时无法确认预约，请稍后重试';
  return typeof translate === 'function' ? translate(text) : text;
}