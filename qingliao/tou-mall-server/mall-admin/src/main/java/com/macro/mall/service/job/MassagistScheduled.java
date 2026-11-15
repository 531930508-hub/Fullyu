package com.macro.mall.service.job;

import com.macro.mall.incentive.service.MonthlySettlementService;
import com.macro.mall.service.SalaryRecordService;
import com.macro.mall.utils.DateUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 客户相关定时任务
 */
@Component
public class MassagistScheduled {

    private static final Logger LOGGER = LoggerFactory.getLogger(MassagistScheduled.class);

    @Autowired
    SalaryRecordService salaryRecordService;

    @Autowired
    MonthlySettlementService monthlySettlementService;

    @Scheduled(cron = "0 0 1 2 * ?")
    public void calcSalaryRecordScheduled() {
        //这个是计算薪资
        String lastMonthCode = DateUtil.getLastMonthCode();
        salaryRecordService.calcSalaryRecordByMonthCode(lastMonthCode);
    }

    /**
     * 每月 2 号 01:30 生成上月结算草稿（全部门店、全部合作状态）。
     * 只覆盖草稿，财务已确认/已发布的记录不动。
     */
    @Scheduled(cron = "0 30 1 2 * ?")
    public void generateMonthlySettlementScheduled() {
        String lastMonthCode = DateUtil.getLastMonthCode();
        try {
            monthlySettlementService.generateAutomatically(lastMonthCode);
        } catch (Exception e) {
            LOGGER.error("月度结算草稿生成失败 month={}", lastMonthCode, e);
        }
    }
}