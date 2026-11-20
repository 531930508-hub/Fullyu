package com.macro.mall.entity;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 疗愈师英文名的迁移契约：测试库守卫、列定义、生产版无条件执行、实体字段对齐。
 */
class MassagistEnglishNameContractTest {

    private String read(String... path) throws Exception {
        return new String(Files.readAllBytes(Paths.get("..", path)), StandardCharsets.UTF_8);
    }

    @Test
    void entityHasEnglishNameField() throws Exception {
        assertNotNull(Massagist.class.getDeclaredField("englishName"));
        assertTrue(Massagist.class.getDeclaredField("englishName").getType() == String.class);
    }

    @Test
    void migrationIsIdempotentAndTestDatabaseOnly() throws Exception {
        String sql = read("sql", "2026-12-05-massagist-english-name.sql");
        assertTrue(sql.replace(" ", "").contains("DATABASE()='tou_mall_test'"));
        assertTrue(sql.contains("fullyu_massagist_english_name_migration_requires_tou_mall_test"));
        assertTrue(sql.contains("information_schema.COLUMNS"));
        assertTrue(sql.contains("`english_name` varchar(64)"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_current"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_demo"));
    }

    @Test
    void prodVersionRunsUnconditionally() throws Exception {
        Path prod = Paths.get("..", "sql", "prod", "2026-12-05-massagist-english-name.sql");
        assertTrue(Files.exists(prod), "生产版应由 scripts/make-prod-sql.py 生成");
        String sql = new String(Files.readAllBytes(prod), StandardCharsets.UTF_8);
        assertTrue(sql.contains("IF(DATABASE()<>'', 1, 0)"));
        assertFalse(sql.contains("IF(DATABASE() = 'tou_mall_test'"));
        assertTrue(sql.contains("`english_name` varchar(64)"));
    }
}
