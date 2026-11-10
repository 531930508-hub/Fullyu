package com.macro.mall.service.job;

import com.macro.mall.service.CustomerCouponService;
import com.macro.mall.service.IntegrationService;
import com.macro.mall.service.OrderDetailService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 客户相关定时任务
 */
@Component
public class CustomerScheduled {
    @Autowired
    CustomerCouponService customerCouponService;
    @Autowired
    IntegrationService integrationService;
    @Autowired
    OrderDetailService orderDetailService;

    @Scheduled(cron = "0 0 0 * * ?")
    public void couponValidDateScheduled() {
        customerCouponService.verifyEndTimeScheduled();
    }

    @Scheduled(cron = "0 0/15 * * * *")
    public void orderTimeoutJob() {
        try {
            orderDetailService.finishScheduled();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

}
