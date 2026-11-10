-- 首页内容：轮播广告（站内跳转）与 8 个系列图槽位覆盖。
-- 图片仅存相对 key，展示时由服务端拼接站点地址；未配置系列时小程序回落到内置图。
CREATE TABLE "banners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_type" TEXT NOT NULL,
    "link_value" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "home_assets" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "image_url" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);
