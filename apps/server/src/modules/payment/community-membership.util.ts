/**
 * Replay paid community orders to derive the current entitlement.
 *
 * Each paid order adds one year from max(payment time, previous entitlement).
 * Refunding one order must only remove that order's contribution, so the
 * remaining membership is recomputed instead of being revoked outright.
 */
export function computeCommunityPaidUntil(
  paymentTimes: Array<Date | string | null | undefined>,
): Date | null {
  const times = paymentTimes
    .map((value) => (value ? new Date(value) : null))
    .filter((value): value is Date => Boolean(value) && !Number.isNaN(value!.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())

  let entitlement: Date | null = null
  for (const paidAt of times) {
    const base: Date =
      entitlement && entitlement.getTime() > paidAt.getTime() ? entitlement : paidAt
    const next: Date = new Date(base.getTime())
    next.setFullYear(next.getFullYear() + 1)
    entitlement = next
  }
  return entitlement
}
