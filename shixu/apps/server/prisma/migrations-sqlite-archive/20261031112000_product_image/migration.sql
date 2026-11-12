-- 商品图：后台上传后保存相对 uploads 的 key，空字符串表示使用内置插画。
ALTER TABLE "products" ADD COLUMN "image_url" TEXT NOT NULL DEFAULT '';
