import type { Database as DatabaseType } from 'better-sqlite3';
import { notFound } from '../lib/errors.js';
import { mapProduct, mapStore, type ProductRow, type StoreRow } from './mappers.js';

export function listStores(db: DatabaseType) {
  return (db.prepare('SELECT * FROM stores ORDER BY city, id').all() as StoreRow[]).map(mapStore);
}

export function getStore(db: DatabaseType, id: string) {
  const row = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as StoreRow | undefined;
  if (!row) throw notFound('门店不存在');
  return mapStore(row);
}

export function listCategories(db: DatabaseType) {
  return db.prepare('SELECT * FROM categories ORDER BY rowid').all() as Array<{
    id: string;
    name: string;
    name_en: string;
    kind: string;
  }>;
}

export function catalogForStore(db: DatabaseType, storeId: string) {
  const store = getStore(db, storeId);
  const categories = listCategories(db);
  const products = db
    .prepare(
      `SELECT p.*, COALESCE(s.grams, 0) AS stock_grams, COALESCE(s.sold_out, 0) AS sold_out
       FROM products p LEFT JOIN stock s ON s.product_id = p.id AND s.store_id = ?
       WHERE p.status = 'published'
       ORDER BY p.series, p.id`
    )
    .all(storeId) as Array<ProductRow & { stock_grams: number; sold_out: number }>;
  return {
    store,
    categories,
    products: products.map((row) => {
      const product = mapProduct(row as ProductRow);
      const stockGrams = Number(row.stock_grams || 0);
      const soldOut = !!row.sold_out;
      const available = !soldOut && (product.kind === 'tea' ? stockGrams >= product.doseGrams : stockGrams > 0);
      return { ...product, stockGrams, soldOut, available };
    })
  };
}

export function stockForStore(db: DatabaseType, storeId: string) {
  return db
    .prepare(
      `SELECT p.id, p.name, p.name_en, p.kind, p.dose_g, p.unit_zh, p.unit_en,
              COALESCE(s.grams, 0) AS grams, COALESCE(s.sold_out, 0) AS sold_out
       FROM products p LEFT JOIN stock s ON s.product_id = p.id AND s.store_id = ?
       WHERE p.status IN ('published','archived','draft')
       ORDER BY p.kind, p.series, p.id`
    )
    .all(storeId)
    .map((row) => {
      const r = row as {
        id: string;
        name: string;
        name_en: string;
        kind: string;
        dose_g: number;
        unit_zh: string;
        unit_en: string;
        grams: number;
        sold_out: number;
      };
      return {
        productId: r.id,
        name: r.name,
        nameEn: r.name_en,
        kind: r.kind,
        doseGrams: r.dose_g,
        unit: r.kind === 'tea' ? 'g' : r.unit_zh,
        unitEn: r.kind === 'tea' ? 'g' : r.unit_en,
        grams: Number(r.grams),
        soldOut: !!r.sold_out
      };
    });
}
