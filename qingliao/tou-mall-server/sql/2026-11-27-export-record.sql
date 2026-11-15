-- Full愈后台导出台账。记录谁在什么时间、用什么筛选条件、下载了哪个导出文件。
-- 写入由 ExportLogAspect 在导出成功后自动完成；写失败只记日志，不影响导出。
-- 只在隔离测试库执行；禁止 mysql --force。
SET @ddl = IF(DATABASE()='tou_mall_test',
  'CREATE TABLE IF NOT EXISTS `s_export_record` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `module` VARCHAR(64) NOT NULL COMMENT ''模块稳定标识，如 order'',
    `module_name` VARCHAR(100) NOT NULL COMMENT ''模块展示名，如 订单列表'',
    `operator_id` BIGINT DEFAULT NULL COMMENT ''操作人后台账号id'',
    `operator_name` VARCHAR(100) DEFAULT NULL COMMENT ''操作人姓名快照'',
    `operator_account` VARCHAR(100) DEFAULT NULL COMMENT ''操作人登录账号快照'',
    `export_time` DATETIME NOT NULL COMMENT ''导出成功时间'',
    `filter_condition` TEXT COMMENT ''导出筛选条件 JSON，不含分页/令牌'',
    `file_name` VARCHAR(255) NOT NULL COMMENT ''实际下载文件名'',
    PRIMARY KEY (`id`),
    KEY `idx_export_record_time` (`export_time`),
    KEY `idx_export_record_module_time` (`module`,`export_time`),
    KEY `idx_export_record_operator_time` (`operator_id`,`export_time`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''后台导出台账''',
  'SELECT * FROM fullyu_export_record_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;