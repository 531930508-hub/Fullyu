-- 导师入驻申请 + 课程提案（增量，纯新增，不改动既有表数据）
-- 说明：本库与 schema.prisma 存在历史漂移（member_card_sync / payment_attempts 等表在库中、不在 schema 中），
-- 因此不使用 prisma db push，只执行本文件的增量 DDL。

ALTER TABLE `users`
  ADD COLUMN `password_hash` VARCHAR(191) NULL,
  ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `trainer_profiles`
  ADD COLUMN `headline` VARCHAR(120) NULL,
  ADD COLUMN `city` VARCHAR(191) NULL,
  ADD COLUMN `portfolio` JSON NULL;

CREATE TABLE `trainer_proposals` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `form` JSON NOT NULL,
  `trainer_id` VARCHAR(191) NULL,
  `reviewer_id` VARCHAR(191) NULL,
  `reviewer_name` VARCHAR(191) NULL,
  `reject_reason` TEXT NULL,
  `reviewed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `trainer_proposals_trainer_id_key`(`trainer_id`),
  INDEX `trainer_proposals_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `course_proposals` (
  `id` VARCHAR(191) NOT NULL,
  `trainer_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `status` ENUM('DRAFT', 'SUBMITTED', 'REVIEWING', 'REJECTED', 'APPROVED', 'PUBLISHED') NOT NULL DEFAULT 'SUBMITTED',
  `title` VARCHAR(191) NOT NULL,
  `theme` VARCHAR(191) NULL,
  `cover_image` LONGTEXT NOT NULL,
  `categories` JSON NOT NULL,
  `target_audience` JSON NOT NULL,
  `duration_minutes` INTEGER NOT NULL DEFAULT 60,
  `total_sessions` INTEGER NOT NULL DEFAULT 1,
  `description` TEXT NULL,
  `goals` TEXT NULL,
  `requirements` TEXT NULL,
  `support_needs` TEXT NULL,
  `materials` JSON NULL,
  `requested_price` DECIMAL(65, 30) NULL,
  `requested_max_capacity` INTEGER NULL,
  `form` JSON NOT NULL,
  `scheduled_venue_id` VARCHAR(191) NULL,
  `scheduled_date` DATETIME(3) NULL,
  `scheduled_start_time` VARCHAR(191) NULL,
  `scheduled_end_time` VARCHAR(191) NULL,
  `final_price` DECIMAL(65, 30) NULL,
  `final_max_capacity` INTEGER NULL,
  `reviewer_id` VARCHAR(191) NULL,
  `reviewer_name` VARCHAR(191) NULL,
  `reject_reason` TEXT NULL,
  `reject_fields` JSON NULL,
  `reviewed_at` DATETIME(3) NULL,
  `published_course_id` VARCHAR(191) NULL,
  `published_at` DATETIME(3) NULL,
  `content_confirmed` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `course_proposals_published_course_id_key`(`published_course_id`),
  INDEX `course_proposals_status_idx`(`status`),
  INDEX `course_proposals_trainer_id_idx`(`trainer_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `trainer_proposals`
  ADD CONSTRAINT `trainer_proposals_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `trainer_proposals_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `trainer_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `course_proposals`
  ADD CONSTRAINT `course_proposals_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `trainer_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `course_proposals_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;