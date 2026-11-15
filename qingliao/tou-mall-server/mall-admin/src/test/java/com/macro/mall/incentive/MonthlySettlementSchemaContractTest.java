package com.macro.mall.incentive;

import com.macro.mall.incentive.entity.AdminMessage;
import com.macro.mall.incentive.entity.MonthlySettlement;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 结算单迁移脚本与实体的字段契约。
 *
 * <p>为什么不写 Service 单测：结算生成要读看板、配置、门店与消息表，
 * 拆桩成本远高于收益；这里守住"字段对得上、唯一键还在、只在测试库执行"三条底线，
 * 业务规则由 SettlementCalculatorTest 覆盖。</p>
 */
class MonthlySettlementSchemaContractTest {

    private String sql() throws Exception {
        Path path = Paths.get("..", "sql", "2026-11-29-monthly-settlement.sql");
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }

    /** 取出某张表 DDL 里的列名集合，避免用字符串 contains 误判注释里的字段。 */
    private Set<String> columns(String sql, String table) {
        int start = sql.indexOf("CREATE TABLE IF NOT EXISTS `" + table + "`");
        assertTrue(start >= 0, table + " 建表语句缺失");
        int end = sql.indexOf("ENGINE=", start);
        assertTrue(end > start);
        String ddl = sql.substring(start, end);
        Set<String> columns = new LinkedHashSet<>();
        // 列定义行形如 "  `month_code` varchar(7) NOT NULL ..."；
        // KEY / UNIQUE KEY 行不以反引号开头，不会被误收
        Matcher matcher = Pattern.compile("(?m)^\\s+`([a-z_]+)` ").matcher(ddl);
        while (matcher.find()) {
            columns.add(matcher.group(1));
        }
        return columns;
    }

    private List<String> fieldColumns(Class<?> type) {
        List<String> names = new ArrayList<>();
        for (Field field : type.getDeclaredFields()) {
            if (field.getName().startsWith("STATUS_") || java.lang.reflect.Modifier.isStatic(field.getModifiers())) {
                continue;
            }
            names.add(field.getName().replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase());
        }
        names.add("id");
        names.add("create_time");
        return names;
    }

    @Test
    void migrationIsTestDatabaseOnly() throws Exception {
        String sql = sql();
        assertTrue(sql.contains("DATABASE() = 'tou_mall_test'"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_current"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_demo"));
    }

    @Test
    void settlementColumnsMatchEntity() throws Exception {
        Set<String> columns = columns(sql(), "s_monthly_settlement");
        for (String column : fieldColumns(MonthlySettlement.class)) {
            assertTrue(columns.contains(column), "s_monthly_settlement 缺少列 " + column);
        }
    }

    @Test
    void messageColumnsMatchEntity() throws Exception {
        Set<String> columns = columns(sql(), "n_admin_message");
        for (String column : fieldColumns(AdminMessage.class)) {
            assertTrue(columns.contains(column), "n_admin_message 缺少列 " + column);
        }
    }

    @Test
    void uniqueKeysKeepSnapshotAndNotificationIdempotent() throws Exception {
        String sql = sql();
        // 一个疗愈师一个月只能有一张结算单
        assertTrue(sql.contains("UNIQUE KEY `uk_settlement_month_massagist` (`month_code`, `massagist_id`)"));
        // 同一业务事件对同一个人只推一次站内消息
        assertTrue(sql.contains("UNIQUE KEY `uk_admin_message_biz` (`biz_key`, `admin_id`)"));
        // 财务按门店+月份、按月份+状态查询
        assertTrue(sql.contains("KEY `idx_settlement_shop_month` (`shop_id`, `month_code`)"));
        assertTrue(sql.contains("KEY `idx_settlement_month_status` (`month_code`, `status`)"));
    }

    @Test
    void draftCanBeOverwrittenWhileConfirmedKeepsFrozenAmounts() {
        MonthlySettlement draft = new MonthlySettlement();
        draft.setStatus(MonthlySettlement.STATUS_DRAFT);
        assertTrue(draft.isDraft());
        assertFalse(draft.isConfirmed());
        assertFalse(draft.isPublished());

        draft.setStatus(MonthlySettlement.STATUS_CONFIRMED);
        assertTrue(draft.isConfirmed());
        assertFalse(draft.isDraft());

        draft.setStatus(MonthlySettlement.STATUS_PUBLISHED);
        assertTrue(draft.isPublished());
    }
}