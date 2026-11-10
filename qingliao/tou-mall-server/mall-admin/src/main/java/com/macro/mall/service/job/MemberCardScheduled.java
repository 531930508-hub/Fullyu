package com.macro.mall.service.job;

import com.macro.mall.service.BrandCardPaymentService;
import com.macro.mall.service.MemberCardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 会员年卡每日任务：待生效转生效、生效转过期。
 *
 * @date 2026/11/07
 */
@Slf4j
@Component
public class MemberCardScheduled {

    @Autowired
    private MemberCardService memberCardService;
    @Autowired
    private BrandCardPaymentService brandCardPaymentService;

    @Scheduled(cron = "0 10 0 * * ?")
    public void scanStatus() {
        try {
            int changed = memberCardService.scanStatus();
            if (changed > 0) {
                log.info("会员年卡状态扫描完成，更新 {} 条", changed);
            }
        } catch (Exception e) {
            log.error("会员年卡状态扫描失败", e);
        }
    }

    /**
     * 品牌会员卡退款后 CRM 撤销失败时每 10 分钟补偿一次；CRM 侧按退款单号幂等。
     */
    @Scheduled(cron = "0 */10 * * * ?")
    public void retryBrandCardCrmRefunds() {
        try {
            int success = brandCardPaymentService.retryPendingCrmRefunds();
            if (success > 0) {
                log.info("品牌会员卡 CRM 撤销补偿完成，成功 {} 条", success);
            }
        } catch (Exception e) {
            log.error("品牌会员卡 CRM 撤销补偿失败", e);
        }
    }
}
