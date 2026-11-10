package com.macro.mall.component;

import com.macro.mall.service.GiveGiftService;
import com.macro.mall.service.OrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 消息的接收者
 */
@Component
public class RabbitMqReceiver {
    private static final Logger LOGGER = LoggerFactory.getLogger(RabbitMqReceiver.class);
    @Autowired
    private OrderService orderService;
    @Autowired
    private GiveGiftService giveGiftService;

    /**
     * 订单超时
     */
    @RabbitListener(queues = "mall.order.cancel")
    public void processOrderExpire(Long orderId) {
        orderService.handleTimeout(orderId);
        LOGGER.info("process orderId:{}", orderId);
    }

    /**
     * 送礼超时
     */
    @RabbitListener(queues = "mall.give.gift")
    public void processGiftExpire(Long giveGiftId) {
        try {
            giveGiftService.handleTimeout(giveGiftId);
            LOGGER.info("process giveGiftId:{}", giveGiftId);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * 订单完成
     */
    @RabbitListener(queues = "mall.order.finish")
    public void processOrderFinishExpire(Long orderId) {
        orderService.handleOrderFinishNotice(orderId);
        LOGGER.info("process orderId:{}", orderId);
    }

    /**
     * 预约开始
     */
    @RabbitListener(queues = "mall.order.start")
    public void processOrderStartExpire(Long orderId) {
        orderService.handleBookingStartNotice(orderId);
        LOGGER.info("process orderId:{}", orderId);
    }
}
