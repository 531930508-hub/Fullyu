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
 * 轮牌看护：营业前预生成当日队列；运行中每分钟扫一遍，把「过了预约时间还没点接待」的单挂成可抢单事项。
 *
 * <p>预生成是幂等的：已经有队列就只做补位，不会重置顺序。以前是「谁先打开看板谁触发初始化」，
 * 同一天不同时段看到的顺序可能不一样，现在固定 0:05 生成、9:30 补一次（排班常常早上才定稿）。</p>
 *
 * <p>超时扫描只落库不推送，前台轮牌看板上直接能看到、能抢；过期的值班意向顺带作废。</p>
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

    @Scheduled(cron = "0 5 0 * * ?")
    public void prebuildQueuesAtMidnight() {
        prebuildQueues();
    }

    @Scheduled(cron = "0 30 9 * * ?")
    public void prebuildQueuesBeforeOpen() {
        prebuildQueues();
    }

    private void prebuildQueues() {
        String day = DateUtil.toYYYYMMDD(LocalDateTime.now());
        List<Shop> shops = shopService.findAvailableShopList();
        int total = 0;
        for (Shop shop : shops) {
            try {
                total += receptionQueueService.prebuild(day, shop.getId());
            } catch (Exception e) {
                // 单店失败不影响其他店，看板打开时仍会兜底初始化
                log.warn("轮牌预生成失败 shop={}", shop.getId(), e);
            }
        }
        log.info("轮牌预生成 day={} 门店={} 队列人数合计={}", day, shops.size(), total);
    }

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
