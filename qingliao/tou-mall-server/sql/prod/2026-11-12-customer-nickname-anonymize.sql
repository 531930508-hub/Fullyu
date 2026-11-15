-- 【生产版】由 sql/2026-11-12-customer-nickname-anonymize.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- Full愈 · 客户默认昵称去手机号化（历史数据迁移）
--
-- 背景：历史客户的默认昵称是「用户+手机号」，等于把手机号变相留在后台的
--       客户列表、订单、排班、导出里。新建客户已改为随机昵称（见 NicknameGenerator）。
--
-- 处理：只替换「仍是系统默认样式」的昵称，客户自己改过名的原样保留。
--   判定样式：nickname = CONCAT('用户', phone)
--          或 nickname 形如 用户+数字（历史上手机号被截断/带国际区号的脏数据）
--   新昵称：中文词 + 4位数字（如 青竹4821），按客户 id 哈希生成，与手机号无关。
--
-- 幂等：执行过一次后不再命中；重复执行结果一致，可安全重跑。
-- 适用：MySQL 5.7 / 8.0。执行前请先备份 c_customer 表。

-- 0) 留痕备份（只备份将被改写的行；表已存在则复用，不覆盖首次备份）
CREATE TABLE IF NOT EXISTS `c_customer_nickname_bak_20261112` (
  `id` BIGINT NOT NULL,
  `nickname` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '昵称去手机号化前的原值备份';

INSERT IGNORE INTO `c_customer_nickname_bak_20261112` (`id`, `nickname`)
SELECT `id`, `nickname`
FROM `c_customer`
WHERE `nickname` = CONCAT('用户', `phone`)
   OR `nickname` REGEXP '^用户[+]?[0-9]{6,}$';

-- 1) 批量替换默认昵称
--    词库顺序必须与 NicknameGenerator.WORDS 一致（单元测试 NicknameGeneratorTest 会校验）
--    哈希用 MD5 两段：词与数字互不相关，避免 CRC32 低位相关导致重名偏多
UPDATE `c_customer`
SET `nickname` = CONCAT(
        ELT(1 + MOD(CONV(SUBSTR(MD5(CONCAT(`id`, '-w')), 1, 8), 16, 10), 48),
            '青竹', '小鹿', '山茶', '听雨', '清风', '暖阳', '星河', '云舒',
            '竹影', '白露', '南风', '微光', '远山', '清溪', '素衣', '知夏',
            '朝颜', '望舒', '扶摇', '云杉', '青禾', '木棉', '晚舟', '月白',
            '归羽', '拾光', '初雪', '轻岚', '溪午', '春信', '秋野', '松间',
            '兰屿', '竹溪', '小满', '惊蛰', '谷雨', '白霜', '星野', '云栖',
            '沐阳', '浅溪', '青柠', '半山', '长夏', '静水', '浮生', '疏影'),
        LPAD(MOD(CONV(SUBSTR(MD5(CONCAT(`id`, '-n')), 9, 8), 16, 10), 10000), 4, '0')
    )
WHERE `nickname` = CONCAT('用户', `phone`)
   OR `nickname` REGEXP '^用户[+]?[0-9]{6,}$';

-- 2) 自检：应返回 0
SELECT COUNT(*) AS still_default_nickname
FROM `c_customer`
WHERE `nickname` = CONCAT('用户', `phone`)
   OR `nickname` REGEXP '^用户[+]?[0-9]{6,}$';

-- 回滚：按备份表恢复（只影响本次被改写的行）
-- UPDATE `c_customer` c
--   JOIN `c_customer_nickname_bak_20261112` b ON b.`id` = c.`id`
--   SET c.`nickname` = b.`nickname`;