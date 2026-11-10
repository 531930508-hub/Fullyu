package com.macro.mall.service.job;

import com.macro.mall.service.SalaryRecordService;
import com.macro.mall.utils.DateUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 客户相关定时任务
 */
@Component
public class MassagistScheduled {
    @Autowired
    SalaryRecordService salaryRecordService;

    @Scheduled(cron = "0 0 1 2 * ?")
    public void calcSalaryRecordScheduled() {
        //这个是计算薪资
        String lastMonthCode = DateUtil.getLastMonthCode();
        salaryRecordService.calcSalaryRecordByMonthCode(lastMonthCode);
    }

}
