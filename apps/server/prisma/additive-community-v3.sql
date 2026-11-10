-- Full愈 · 社群 V3 增量迁移（只新增列/表，不删除、不修改既有列）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-community-v3.sql --schema prisma/schema.prisma
-- 注意：本文件可单独审计；不要用 prisma db push / migrate，避免触及其他人工维护的表。

-- 1) 社群动态点赞（一人一赞；取消点赞直接删行，community_posts.likes 作为冗余计数同步维护）
CREATE TABLE `community_post_likes` (
  `id` VARCHAR(191) NOT NULL,
  `post_id` VARCHAR(191) NOT NULL,
  `community_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `community_post_likes_post_id_user_id_key` (`post_id`, `user_id`),
  INDEX `community_post_likes_community_id_user_id_idx` (`community_id`, `user_id`),
  CONSTRAINT `community_post_likes_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `community_posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `community_post_likes_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) 订阅制社群：代结算协议勾选留痕
ALTER TABLE `communities`
  ADD COLUMN `settlement_agreement_version` VARCHAR(32) NULL,
  ADD COLUMN `settlement_agreed_at` DATETIME(3) NULL;
