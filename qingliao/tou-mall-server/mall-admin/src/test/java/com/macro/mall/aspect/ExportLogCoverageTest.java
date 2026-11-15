package com.macro.mall.aspect;

import com.macro.mall.annotation.ExportLog;
import com.macro.mall.controller.CustomerController;
import com.macro.mall.controller.GiftCardController;
import com.macro.mall.controller.OrderController;
import com.macro.mall.controller.statistics.StatisticsController;
import com.macro.mall.incentive.controller.IncentiveController;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/** 防止新增/改名导出入口时漏挂台账注解。 */
class ExportLogCoverageTest {

    @Test
    void everyAdminExportEndpointDeclaresModule() throws Exception {
        Object[][] endpoints = {
                {OrderController.class, "orderExport", "order"},
                {CustomerController.class, "exportCustomer", "customer"},
                {GiftCardController.class, "export", "gift_card"},
                {StatisticsController.class, "serviceDurationExport", "statistics_service_duration"},
                {StatisticsController.class, "therapistStatsExport", "statistics_therapist"},
                {StatisticsController.class, "operatingRevenueExport", "statistics_operating_revenue"},
                {StatisticsController.class, "operatingRevenueDailyExport", "statistics_operating_revenue_daily"},
                {StatisticsController.class, "operatingRevenueXinZiExport", "statistics_salary"},
                {StatisticsController.class, "operatingRevenueFuWuExport", "statistics_service_fee"},
                {IncentiveController.class, "exportAssessments", "incentive_training_assessment"},
                {IncentiveController.class, "exportCertifications", "incentive_training_certification"},
                {IncentiveController.class, "export", "incentive_monthly_reward"}
        };
        Set<String> modules = new HashSet<>();
        for (Object[] endpoint : endpoints) {
            Class<?> type = (Class<?>) endpoint[0];
            Method method = Arrays.stream(type.getDeclaredMethods())
                    .filter(m -> m.getName().equals(endpoint[1]))
                    .findFirst().orElseThrow(() -> new AssertionError("找不到导出方法 " + endpoint[1]));
            ExportLog annotation = method.getAnnotation(ExportLog.class);
            assertNotNull(annotation, type.getSimpleName() + "#" + method.getName() + " 缺少 @ExportLog");
            assertEquals(endpoint[2], annotation.module(), "模块标识应稳定，不能随展示名变化");
            assertFalse(annotation.value().trim().isEmpty(), "模块展示名不能为空");
            assertTrue(modules.add(annotation.module()), "模块标识重复: " + annotation.module());
        }
    }
}