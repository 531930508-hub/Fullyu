/**
 * 列表页「+」的重复加购规格。
 * 同一杯茶已经在袋里时，再点 + 直接沿用上次的温度/冰量，少开一次弹层；
 * 想换规格仍然点商品名进入详情。不同规格会各自成为一行，数量按商品合并展示。
 */
export function repeatSpecFor(lines, productId) {
  const line = (lines || []).find((entry) => entry.product && entry.product.id === productId);
  if (!line) return null;
  return { temp: line.temp, ice: line.ice || null };
}

export function productQtyInCart(lines, productId) {
  return (lines || []).reduce(
    (total, entry) => (entry.product && entry.product.id === productId ? total + (entry.qty || 0) : total),
    0
  );
}
