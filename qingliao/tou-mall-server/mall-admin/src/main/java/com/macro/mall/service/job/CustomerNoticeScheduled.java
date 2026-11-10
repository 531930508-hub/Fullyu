package com.macro.mall.service.job;

import com.macro.mall.entity.CustomerCoupon;
import com.macro.mall.mapper.CustomerNoticeMapper;
import com.macro.mall.service.CustomerNoticeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@Component
@Slf4j
public class CustomerNoticeScheduled {
    @Autowired CustomerNoticeMapper mapper;
    @Autowired CustomerNoticeService notices;
    private long cursor;
    private LocalDate cursorDay;

    @Scheduled(cron="0 0/30 * * * ?",zone="Asia/Shanghai")
    public void scheduled() { poll(LocalDate.now(ZoneId.of("Asia/Shanghai"))); }

    public synchronized void poll(LocalDate today) {
        if (!notices.isEnabled()) return;
        if (!today.equals(cursorDay)) { cursor=0; cursorDay=today; }
        // 每轮最多2000条，下一轮从游标接着扫，单条失败不会堵住后面的人。
        for (int batch=0;batch<20;batch++) {
            List<CustomerCoupon> due=mapper.dueCoupons(cursor,today,today.plusDays(5),today.plusDays(3),100);
            if (due.isEmpty()) { cursor=0; return; }
            for (CustomerCoupon coupon:due) {
                cursor=coupon.getId();
                try { notices.notifyCoupon(coupon,today); }
                catch (Exception e) {
                    // 不记录用户身份资料、模板回执或第三方响应正文。
                    log.warn("券到期提醒处理失败，couponId={}",coupon.getId());
                }
            }
        }
    }
}
