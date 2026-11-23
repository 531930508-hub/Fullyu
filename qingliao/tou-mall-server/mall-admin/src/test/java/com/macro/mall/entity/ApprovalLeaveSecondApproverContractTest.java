package com.macro.mall.entity;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 请假内置规则「二级审批人（总部CEO）」的迁移契约：配置落在审批设置里，不再写死在配置文件。
 *
 * <p>为什么要守这条：请假没配流程节点时走「店长 → 总部CEO」的内置规则，
 * 二级审批人原来读配置项 approval.leave.second-approver-admin-id，换个 CEO 就得改配置重启。
 * 现在改存 f_approval_category.second_approver_admin_id：
 * 只改代码不跑脚本，MyBatis-Plus 会把这一列拼进每条查询，审批设置整页 Unknown column；
 * 反过来只改脚本不加校验，后台可以把「停用账号」存成二审人，当天请假提交时才炸。</p>
 *
 * @author Full愈
 * @date 2026/11/23
 */
class ApprovalLeaveSecondApproverContractTest {

    private String read(String... path) throws Exception {
        return new String(Files.readAllBytes(Paths.get("..", path)), StandardCharsets.UTF_8);
    }

    @Test
    void entityStoresSecondApproverAdminId() throws Exception {
        assertEquals(Long.class, ApprovalCategory.class.getDeclaredField("secondApproverAdminId").getType());
    }

    @Test
    void chainTakesSecondApproverFromCategoryInsteadOfConfig() throws Exception {
        String detail = read("mall-admin", "src", "main", "java", "com", "macro", "mall",
                "service", "ApprovalDetailService.java");
        assertTrue(detail.contains("category.getSecondApproverAdminId()"), "内置规则要读审批配置上的二审人");
        String nodeService = read("mall-admin", "src", "main", "java", "com", "macro", "mall",
                "service", "ApprovalFlowNodeService.java");
        assertFalse(nodeService.contains("second-approver-admin-id"), "别再留配置文件兜底，否则后台改了不生效");
        assertFalse(nodeService.contains("@Value"), "内置规则不应再从配置项取审批人");
    }

    @Test
    void migrationIsIdempotentAndTestDatabaseOnly() throws Exception {
        String sql = read("sql", "2026-11-23-approval-leave-second-approver.sql");
        assertTrue(sql.replace(" ", "").contains("DATABASE()='tou_mall_test'"));
        // 加列要先查 information_schema，重复执行不报错
        assertTrue(sql.contains("information_schema.COLUMNS"));
        assertTrue(sql.contains("f_approval_category ADD COLUMN second_approver_admin_id"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_current"));
        assertFalse(sql.replace("tou_mall_test", "").contains("tou_mall_demo"));
    }

    @Test
    void prodVersionRunsUnconditionally() throws Exception {
        Path prod = Paths.get("..", "sql", "prod", "2026-11-23-approval-leave-second-approver.sql");
        assertTrue(Files.exists(prod), "生产版应由 scripts/make-prod-sql.py 生成");
        String sql = new String(Files.readAllBytes(prod), StandardCharsets.UTF_8);
        assertTrue(sql.contains("IF(DATABASE()<>'', 1, 0)"));
        assertFalse(sql.contains("IF(DATABASE() = 'tou_mall_test'"));
        assertTrue(sql.contains("ADD COLUMN second_approver_admin_id"));
    }
}