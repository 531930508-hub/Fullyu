export function canConfirmBooking(loading, selectedTime, slots) {
  return !loading && !!selectedTime && (slots || []).some(slot =>
    slot.time === selectedTime && Number(slot.state) === 1);
}

export function bookingFailureMessage(error) {
  if (typeof error === 'string' && error.trim()) return error;
  return error && error.message ? error.message : '暂时无法确认预约，请稍后重试';
}
