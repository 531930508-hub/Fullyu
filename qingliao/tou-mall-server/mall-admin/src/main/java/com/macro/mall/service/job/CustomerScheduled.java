package com.macro.mall.service.job;

import com.macro.mall.service.CustomerCouponService;
import com.macro.mall.service.CustomerService;
import com.macro.mall.service.IntegrationService;
import com.macro.mall.service.OrderDetailService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 客户相关定时任务
 */
@Slf4j
@Component
public class CustomerScheduled {
    @Autowired
    CustomerCouponService customerCouponService;
    @Autowired
    IntegrationService integrationService;
    @Autowired
    OrderDetailService orderDetailService;
    @Autowired
    CustomerService customerService;

    /**
     * 会员中心兜底补扫：把近 3 天新建的客户再确认一次 CRM 身份，
     * 覆盖建号时会员中心不可用、或绕过 save 直接落库的客户。
     */
    @Scheduled(cron = "0 10 3 * * ?", zone = "Asia/Shanghai")
    public void crmIdentityBackfillScheduled() {
        try {
            customerService.backfillCrmIdentities(3);
        } catch (Exception e) {
            log.error("会员中心身份补扫失败", e);
        }
    }

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
