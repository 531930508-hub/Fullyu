package com.macro.mall.service;

import com.macro.mall.entity.ReceptionQueue;
import com.macro.mall.entity.ReceptionQueueLog;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 轮牌拆两套队列（服务单 / 接待单）的迁移契约：守卫、加列、唯一键口径、生产版无条件执行、实体与常量对齐。
 *
 * <p>为什么要守这条：s_reception_queue 原来的唯一键是「日期+门店+人」。不换成
 * 「日期+门店+轮牌类型+人」，同一个人当天在接待队里建行就会撞旧键；反过来只改代码不跑脚本，
 * MyBatis-Plus 会把 queue_kind / duty_time 拼进每条 SQL，整块轮牌看板直接 Unknown column。</p>
 */
class ReceptionQueueTwoKindContractTest {

    private String read(String... path) throws Exception {
        return new String(Files.readAllBytes(Paths.get("..", path)), StandardCharsets.UTF_8);
    }

    @Test
    void entityHasQueueKindAndDutyTime() throws Exception {
        assertEquals(Integer.class, ReceptionQueue.class.getDeclaredField("queueKind").getType());
        assertEquals(LocalDateTime.class, ReceptionQueue.class.getDeclaredField("dutyTime").getType());
        assertEquals(Integer.class, ReceptionQueueLog.class.getDeclaredField("queueKind").getType());
    }

    @Test
    void kindConstantsMatchMigrationComment() {
        assertEquals(0, ReceptionQueueService.KIND_SERVICE, "0 = 服务单轮牌（老数据默认值）");
        assertEquals(1, ReceptionQueueService.KIND_RECEPTION, "1 = 接待单轮牌");
    }

    @Test
    void migrationIsIdempotentAndTestDatabaseOnly() throws Exception {
        String sql = read("sql", "2026-12-08-reception-queue-two-kind.sql");
        assertTrue(sql.replace(" ", "").contains("DATABASE()='tou_mall_test'"));
        // 加列 / 换唯一键都必须先查 information_schema 再执行，重复跑不报错
        assertTrue(sql.contains("information_schema.COLUMNS"));
        assertTrue(sql.contains("information_schema.STATISTICS"));
        assertTrue(sql.contains("uk_date_shop_kind_massagist (queue_date, shop_id, queue_kind, massagist_id)"));
        // 旧唯一键必须先去掉，否则同一个人在两套队列里各建一行会冲突
        assertTrue(sql.contains("DROP INDEX uk_date_shop_massagist"));
        assertTrue(sql.contains("s_reception_queue ADD COLUMN queue_kind"));
        assertTrue(sql.contains("s_reception_queue ADD COLUMN duty_time"));
        assertTrue(sql.contains("s_reception_queue_log ADD COLUMN queue_kind"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_current"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_demo"));
    }

    @Test
    void prodVersionRunsUnconditionally() throws Exception {
        Path prod = Paths.get("..", "sql", "prod", "2026-12-08-reception-queue-two-kind.sql");
        assertTrue(Files.exists(prod), "生产版应由 scripts/make-prod-sql.py 生成");
        String sql = new String(Files.readAllBytes(prod), StandardCharsets.UTF_8);
        assertTrue(sql.contains("IF(DATABASE()<>'', 1, 0)"));
        assertFalse(sql.contains("IF(DATABASE() = 'tou_mall_test'"));
        assertTrue(sql.contains("uk_date_shop_kind_massagist"));
        assertTrue(sql.contains("ADD COLUMN queue_kind"));
    }

    @Test
    void queueAdvancesAreRoutedByKind() throws Exception {
        // 服务单走服务队、接待单走接待队：谁被推进由明细上钟流水记下的 queue_kind 决定
        String service = read("mall-admin", "src", "main", "java", "com", "macro", "mall",
                "service", "ReceptionQueueService.java");
        assertTrue(service.contains("public int kindOfDetail("), "撤销回位/抢单要能按明细认出推的是哪一队");
        assertTrue(service.contains("KIND_RECEPTION"), "接待单上钟要能推接待队");
    }
}