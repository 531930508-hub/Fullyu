-- 茶单排序：总部维护商品默认顺序，门店可用库存记录上的顺序覆盖本店。
ALTER TABLE "products" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stock" ADD COLUMN "sort_order" INTEGER;
