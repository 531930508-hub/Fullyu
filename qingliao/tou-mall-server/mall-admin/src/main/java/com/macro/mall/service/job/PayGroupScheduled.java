package com.macro.mall.service.job;

import com.macro.mall.service.PayGroupService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 合并支付（预约 + 会员卡续费）定时任务：关闭超时未支付的合并单。
 *
 * @date 2026/12/01
 */
@Slf4j
@Component
public class PayGroupScheduled {

    @Autowired
    private PayGroupService payGroupService;

    @Scheduled(cron = "0 */5 * * * ?")
    public void closeExpired() {
        try {
            int closed = payGroupService.closeExpired();
            if (closed > 0) {
                log.info("合并支付超时关闭 {} 条", closed);
            }
        } catch (Exception e) {
            log.error("合并支付超时关闭失败", e);
        }
    }
}