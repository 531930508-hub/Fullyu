-- Full愈 · 社群 V2 增量迁移（只新增列/表，不删除、不修改既有列）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-community-v2.sql --schema prisma/schema.prisma
-- 注意：本文件可单独审计；不要用 prisma db push / migrate，避免触及其他人工维护的表。

-- 1) 主理人角色（基础 / 扩展）
ALTER TABLE `users`
  ADD COLUMN `community_host_role` ENUM('BASIC', 'EXTENDED') NULL;

-- 2) 社群可见性、入群方式、兴趣池、分享视觉
ALTER TABLE `communities`
  ADD COLUMN `visibility` ENUM('PUBLIC', 'HIDDEN', 'INVITE_ONLY') NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN `join_mode` ENUM('OPEN', 'APPROVAL', 'INVITE') NOT NULL DEFAULT 'OPEN',
  ADD COLUMN `interest_pool` TEXT NULL,
  ADD COLUMN `share_artwork` TEXT NULL;

-- 3) 活动结束时间、可见范围、启用状态、详情、分享视觉
ALTER TABLE `community_events`
  ADD COLUMN `end_time` VARCHAR(10) NULL,
  ADD COLUMN `scope` ENUM('PUBLIC', 'INTERNAL') NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `share_artwork` TEXT NULL;

-- 4) 动态后期治理字段
ALTER TABLE `community_posts`
  ADD COLUMN `is_hidden` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `is_deleted` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `hidden_reason` TEXT NULL,
  ADD COLUMN `moderated_at` DATETIME(3) NULL,
  ADD COLUMN `moderated_by` VARCHAR(191) NULL;

-- 5) 成员隐私、兴趣、权益来源
ALTER TABLE `community_joins`
  ADD COLUMN `privacy` ENUM('NONE', 'COMPLETED', 'ALL') NOT NULL DEFAULT 'NONE',
  ADD COLUMN `interests` TEXT NULL,
  ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'PAID',
  ADD COLUMN `order_id` VARCHAR(191) NULL;

-- 6) 订单：邀请/礼遇留痕 + 平台服务费
ALTER TABLE `orders`
  ADD COLUMN `community_invite_id` VARCHAR(191) NULL,
  ADD COLUMN `community_invite_claim_id` VARCHAR(191) NULL,
  ADD COLUMN `platform_fee` DECIMAL(65, 30) NOT NULL DEFAULT 0;

-- 7) 入群申请
CREATE TABLE `community_join_requests` (
  `id` VARCHAR(191) NOT NULL,
  `community_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `note` TEXT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` VARCHAR(191) NULL,
  `reviewed_by_name` VARCHAR(191) NULL,
  `review_note` TEXT NULL,
  `reviewed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `community_join_requests_community_id_user_id_key` (`community_id`, `user_id`),
  INDEX `community_join_requests_community_id_status_idx` (`community_id`, `status`),
  CONSTRAINT `community_join_requests_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 8) 邀请/礼遇
CREATE TABLE `community_invites` (
  `id` VARCHAR(191) NOT NULL,
  `community_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `kind` ENUM('NORMAL', 'WAIVER', 'REDUCE') NOT NULL DEFAULT 'NORMAL',
  `amount` INT NOT NULL DEFAULT 0,
  `expires_at` DATETIME(3) NULL,
  `quota` INT NOT NULL DEFAULT 0,
  `used_count` INT NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `note` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `community_invites_community_id_is_active_idx` (`community_id`, `is_active`),
  CONSTRAINT `community_invites_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 9) 邀请领取（每人每张一次）
CREATE TABLE `community_invite_claims` (
  `id` VARCHAR(191) NOT NULL,
  `invite_id` VARCHAR(191) NOT NULL,
  `community_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `claimed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `used_at` DATETIME(3) NULL,
  `order_id` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `community_invite_claims_invite_id_user_id_key` (`invite_id`, `user_id`),
  INDEX `community_invite_claims_user_id_community_id_idx` (`user_id`, `community_id`),
  CONSTRAINT `community_invite_claims_invite_id_fkey` FOREIGN KEY (`invite_id`) REFERENCES `community_invites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `community_invite_claims_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 10) 动态评论（即时可见 + 后期治理）
CREATE TABLE `community_comments` (
  `id` VARCHAR(191) NOT NULL,
  `post_id` VARCHAR(191) NOT NULL,
  `community_id` VARCHAR(191) NOT NULL,
  `author_id` VARCHAR(191) NULL,
  `author_name` VARCHAR(191) NOT NULL DEFAULT '',
  `author_avatar` LONGTEXT NULL,
  `content` TEXT NOT NULL,
  `is_hidden` BOOLEAN NOT NULL DEFAULT false,
  `is_deleted` BOOLEAN NOT NULL DEFAULT false,
  `hidden_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `community_comments_post_id_created_at_idx` (`post_id`, `created_at`),
  CONSTRAINT `community_comments_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `community_posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `community_comments_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 11) 内容治理日志
CREATE TABLE `community_moderation_logs` (
  `id` VARCHAR(191) NOT NULL,
  `community_id` VARCHAR(191) NOT NULL,
  `target_type` VARCHAR(20) NOT NULL,
  `target_id` VARCHAR(191) NOT NULL,
  `action` VARCHAR(20) NOT NULL,
  `reason` TEXT NOT NULL,
  `actor_type` VARCHAR(20) NOT NULL,
  `actor_id` VARCHAR(191) NULL,
  `actor_name` VARCHAR(191) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `community_moderation_logs_community_id_created_at_idx` (`community_id`, `created_at`),
  CONSTRAINT `community_moderation_logs_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 12) 活动报名
CREATE TABLE `community_event_signups` (
  `id` VARCHAR(191) NOT NULL,
  `event_id` VARCHAR(191) NOT NULL,
  `community_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'SIGNED',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `community_event_signups_event_id_user_id_key` (`event_id`, `user_id`),
  INDEX `community_event_signups_community_id_user_id_idx` (`community_id`, `user_id`),
  CONSTRAINT `community_event_signups_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `community_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `community_event_signups_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
