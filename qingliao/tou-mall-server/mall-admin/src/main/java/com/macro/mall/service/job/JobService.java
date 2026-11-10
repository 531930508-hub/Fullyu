package com.macro.mall.service.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.entity.GiveGift;
import com.macro.mall.entity.Order;
import com.macro.mall.enums.GiveGiftState;
import com.macro.mall.enums.OrderState;
import com.macro.mall.service.GiveGiftService;
import com.macro.mall.service.OrderService;
import com.macro.mall.utils.DateUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Created by oahnus on 2025/6/19
 *
 * @author oahnus
 */
@Slf4j
@Service
public class JobService {
    @Autowired
    private GiveGiftService giveGiftService;
    @Autowired
    private OrderService orderService;

    /**
     * 券包礼物 超时补偿
     */
    @Scheduled(cron = "0 */10 * * * *")
    public void giftTimeoutHandler() {
        log.debug("run gift timeout job ");

        try {
            LocalDateTime time = LocalDateTime.now().minusHours(GiveGiftService.TIMEOUT_HOUR);

            List<GiveGift> timeoutGifts = giveGiftService.list(new LambdaQueryWrapper<GiveGift>()
                    .eq(GiveGift::getState, GiveGiftState.DOING.getValue())
                    .lt(GiveGift::getSendTime, time)
                    .isNotNull(GiveGift::getSendTime)
            );

            if (CollectionUtils.isEmpty(timeoutGifts)) {
                return;
            }

            for (GiveGift gift : timeoutGifts) {
                log.info("gift timeout: id={}", gift.getId());
                giveGiftService.handleTimeout(gift.getId());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Scheduled(cron = "0 */10 * * * *")
    public void orderTimeoutJob() {
        //运行订单超时
        log.debug("run order timeout job ");
        try {
            List<Order> timeoutList = orderService.list(new LambdaQueryWrapper<Order>()
                    .eq(Order::getState, OrderState.NOT_PAY.getValue()).isNotNull(Order::getOverTimeSeconds)
            );
            if (CollectionUtils.isEmpty(timeoutList)) {
                return;
            }
            LocalDateTime now = LocalDateTime.now();
            for (Order order : timeoutList) {
                log.info("order timeout: id={}", order.getId());
                Integer overTimeSeconds = order.getOverTimeSeconds();
                if (overTimeSeconds == null) {
                    continue;
                }
                long seconds = DateUtil.diffSeconds(order.getCreateTime(), now);
                if(seconds > overTimeSeconds) {
                    orderService.handleTimeout(order.getId());
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
