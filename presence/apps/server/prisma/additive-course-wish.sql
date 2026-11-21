-- Full愈 · 往期课程「许愿」增量迁移（只新增表/列/索引，不删除、不改动既有数据）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-course-wish.sql --schema prisma/schema.prisma
-- 背景：
--   1) 已结束课程详情页给用户「许个心愿」入口，表达想再上同类课；
--      心愿数用于复购运营，课程开新班时按心愿推送订阅消息（需先申请订阅消息模板）。
--   2) courses.source_course_id 记录副本来源：管理员复制往期课程排新班并发布时，
--      据此找到原课程的心愿用户逐个通知；同一心愿只通知一次（notified_at）。

-- 1) 课程副本来源（可为空；无外键，仅作溯源，源课程删除不影响副本）
ALTER TABLE `courses` ADD COLUMN `source_course_id` VARCHAR(191) NULL;

-- 2) 许愿表
CREATE TABLE `course_wishes` (
  `id` VARCHAR(191) NOT NULL,
  `course_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `notified_at` DATETIME(3) NULL,
  `notified_course_id` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `course_wishes_course_id_user_id_key` (`course_id`, `user_id`),
  INDEX `course_wishes_user_id_created_at_idx` (`user_id`, `created_at`),
  CONSTRAINT `course_wishes_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_wishes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_wishes_notified_course_id_fkey` FOREIGN KEY (`notified_course_id`) REFERENCES `courses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;