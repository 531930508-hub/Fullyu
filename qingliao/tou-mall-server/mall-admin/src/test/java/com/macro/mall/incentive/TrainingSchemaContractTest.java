package com.macro.mall.incentive;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrainingSchemaContractTest {

    private String sql() throws Exception {
        Path path = Paths.get("..", "sql", "2026-11-09-training-team-cert.sql");
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }

    @Test
    void migrationIsTestDatabaseOnly() throws Exception {
        String sql = sql();
        assertTrue(sql.contains("DATABASE()='tou_mall_test'"));
        assertTrue(sql.contains("fullyu_training_team_migration_requires_tou_mall_test"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_current"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_demo"));
    }

    @Test
    void assessmentTableKeepsAuditAndVoteColumns() throws Exception {
        String sql = sql();
        assertTrue(sql.contains("`trainer_massagist_id`"));
        assertTrue(sql.contains("`submitted_at`"));
        assertTrue(sql.contains("`voided`"));
        assertTrue(sql.contains("`idx_assess_target`"));
        assertTrue(sql.contains("`certified_at`"));
        assertTrue(sql.contains("`team_size`"));
    }
}
