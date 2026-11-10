/**
 * 列表页「+」的规格判断。
 * 茶的温度/冰量是真实选择：同款可以一杯热、一杯冰，不能沿用上一杯直接 +1。
 * 只有完全没得选（单一温度且无冰量）时才允许直接加购。
 */
export function needsSpecChoice(product) {
  if (!product) return false;
  const temps = Array.isArray(product.temps) ? product.temps : [];
  // 只有热饮的商品可能仍带 ice 标记，没有真实可选项时直接加购，不逼顾客多点一次。
  if (temps.length > 1) return true;
  return Boolean(product.ice) && temps.some((temp) => temp !== '热');
}

/** 详情弹层预选上次同款规格；同款有多行时取最后加入的一行，顾客仍可再改。 */
export function lastSpecFor(lines, productId) {
  for (let index = (lines || []).length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && line.product && line.product.id === productId) {
      return { temp: line.temp, ice: line.ice || null };
    }
  }
  return null;
}

export function productQtyInCart(lines, productId) {
  return (lines || []).reduce(
    (total, entry) => (entry.product && entry.product.id === productId ? total + (entry.qty || 0) : total),
    0
  );
}
