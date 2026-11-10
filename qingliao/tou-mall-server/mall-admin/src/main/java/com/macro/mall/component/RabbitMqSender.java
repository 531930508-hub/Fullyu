package com.macro.mall.component;

import com.macro.mall.enums.QueueEnum;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 队列的发送者
 */
@Component
public class RabbitMqSender {
    private static final Logger LOGGER = LoggerFactory.getLogger(RabbitMqSender.class);
    @Autowired
    private AmqpTemplate amqpTemplate;

    /**
     * 订单超时
     */
    public void sendOrderCancelMessage(Long orderId, final long delayTimes) {
        //给延迟队列发送消息
        amqpTemplate.convertAndSend(QueueEnum.QUEUE_TTL_ORDER_CANCEL.getExchange(), QueueEnum.QUEUE_TTL_ORDER_CANCEL.getRouteKey(), orderId, message -> {
            //给消息设置延迟毫秒值
            message.getMessageProperties().setExpiration(String.valueOf(delayTimes));
            return message;
        });
        LOGGER.info("send orderId:{}", orderId);
    }

    /**
     * 送礼超时
     */
    public void sendGiveGiftMessage(Long giveGiftId, final long delayTimes) {
        //给延迟队列发送消息
        amqpTemplate.convertAndSend(QueueEnum.QUEUE_TTL_GIVE_GIFT.getExchange(), QueueEnum.QUEUE_TTL_GIVE_GIFT.getRouteKey(), giveGiftId, message -> {
            //给消息设置延迟毫秒值
            message.getMessageProperties().setExpiration(String.valueOf(delayTimes));
            return message;
        });
        LOGGER.info("send giveGiftId:{}", giveGiftId);
    }

    /**
     * 订单完成
     */
    public void sendOrderFinishMessage(Long orderId, final long delayTimes) {
        //给延迟队列发送消息
        amqpTemplate.convertAndSend(QueueEnum.QUEUE_TTL_ORDER_FINISH.getExchange(), QueueEnum.QUEUE_TTL_ORDER_FINISH.getRouteKey(), orderId, message -> {
            //给消息设置延迟毫秒值
            message.getMessageProperties().setExpiration(String.valueOf(delayTimes));
            return message;
        });
        LOGGER.info("send orderId:{}", orderId);
    }

    /**
     * 预约开始
     */
    public void sendOrderStartMessage(Long orderId, final long delayTimes) {
        //给延迟队列发送消息
        amqpTemplate.convertAndSend(QueueEnum.QUEUE_TTL_ORDER_START.getExchange(), QueueEnum.QUEUE_TTL_ORDER_START.getRouteKey(), orderId, message -> {
            //给消息设置延迟毫秒值
            message.getMessageProperties().setExpiration(String.valueOf(delayTimes));
            return message;
        });
        LOGGER.info("send orderId:{}", orderId);
    }
}
