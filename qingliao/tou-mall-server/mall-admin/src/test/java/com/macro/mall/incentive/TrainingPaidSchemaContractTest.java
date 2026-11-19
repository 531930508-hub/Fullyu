package com.macro.mall.incentive;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 「已计发」字段的迁移契约：测试库守卫、列定义、生产版无条件执行。
 */
class TrainingPaidSchemaContractTest {

    private String read(String path) throws Exception {
        return new String(Files.readAllBytes(Paths.get("..", "sql", path)), StandardCharsets.UTF_8);
    }

    @Test
    void migrationIsTestDatabaseOnly() throws Exception {
        String sql = read("2026-12-04-training-cert-paid.sql");
        assertTrue(sql.replace(" ", "").contains("DATABASE()='tou_mall_test'"));
        assertTrue(sql.contains("fullyu_training_cert_paid_migration_requires_tou_mall_test"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_current"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_demo"));
    }

    @Test
    void certTableGetsPaidColumns() throws Exception {
        String sql = read("2026-12-04-training-cert-paid.sql");
        assertTrue(sql.contains("`paid_month` varchar(7)"));
        assertTrue(sql.contains("`paid_amount` decimal(12,2)"));
        assertTrue(sql.contains("`s_massagist_training_cert`"));
        assertTrue(sql.contains("information_schema.COLUMNS"));
    }

    @Test
    void prodVersionRunsUnconditionally() throws Exception {
        Path prod = Paths.get("..", "sql", "prod", "2026-12-04-training-cert-paid.sql");
        assertTrue(Files.exists(prod), "生产版应由 scripts/make-prod-sql.py 生成");
        String sql = new String(Files.readAllBytes(prod), StandardCharsets.UTF_8);
        // 生成器只把守卫条件改成恒真，错误分支保留但不可达。
        assertTrue(sql.contains("IF(DATABASE()<>'', 1, 0)"));
        assertFalse(sql.contains("IF(DATABASE() = 'tou_mall_test'"));
        assertTrue(sql.contains("`paid_month` varchar(7)"));
    }
}
