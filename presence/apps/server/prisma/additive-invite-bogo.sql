-- Full愈 · 邀请好友买一赠一增量迁移（只新增列/索引，不删除、不改动既有数据）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-invite-bogo.sql --schema prisma/schema.prisma
-- 背景：
--   1) 邀请券由「免费体验课」改为「买一赠一券」：券归好友，host_user_id 记录邀请人；
--      好友只能在与邀请人同报名的已支付课程上使用，退款/退课时好友席一并取消。
--   2) 好友订单 sponsor_order_id 指回邀请人订单，用于退款级联与对账。
-- 状态：2026-11-17 已在生产 RDS 执行（列+索引+外键），migrate diff 无剩余 ADD COLUMN。

-- 1) 券上的邀请人（普通索引，支持按人查券/级联回收；可为空，存量券不受影响）
ALTER TABLE `vouchers` ADD COLUMN `host_user_id` VARCHAR(191) NULL;
ALTER TABLE `vouchers` ADD INDEX `vouchers_host_user_id_idx` (`host_user_id`);
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_host_user_id_fkey`
  FOREIGN KEY (`host_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) 好友同席订单指回邀请人订单（普通索引，支持按邀请人订单查同席单）
ALTER TABLE `orders` ADD COLUMN `sponsor_order_id` VARCHAR(191) NULL;
ALTER TABLE `orders` ADD INDEX `orders_sponsor_order_id_idx` (`sponsor_order_id`);
ALTER TABLE `orders` ADD CONSTRAINT `orders_sponsor_order_id_fkey`
  FOREIGN KEY (`sponsor_order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;