package com.macro.mall.service.job;

import com.macro.mall.entity.Shop;
import com.macro.mall.service.ReceptionQueueService;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.utils.DateUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 轮牌看护：每分钟扫一遍，把「过了预约时间还没点接待」的单挂成可抢单事项。
 *
 * <p>只落库不推送，前台轮牌看板上直接能看到、能抢；过期的值班意向顺带作废。</p>
 *
 * @author reception
 * @date 2026/12/08
 */
@Component
@Slf4j
public class ReceptionQueueScheduled {

    @Autowired
    ShopService shopService;
    @Autowired
    ReceptionQueueService receptionQueueService;

    @Scheduled(cron = "0 * * * * ?")
    public void scanTimeout() {
        String day = DateUtil.toYYYYMMDD(LocalDateTime.now());
        List<Shop> shops = shopService.findAvailableShopList();
        for (Shop shop : shops) {
            try {
                receptionQueueService.scanTimeout(day, shop.getId());
            } catch (Exception e) {
                // 单店失败不影响其他店，下一分钟会重试
                log.warn("轮牌超时扫描失败 shop={}", shop.getId(), e);
            }
        }
    }
}
