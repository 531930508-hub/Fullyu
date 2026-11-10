package com.macro.mall.enums;

import lombok.Getter;

/**
 * 消息队列枚举类
 * Created by macro on 2018/9/14.
 */
@Getter
public enum QueueEnum {
    /**
     * 订单超时通知队列
     */
    QUEUE_ORDER_CANCEL("mall.order.direct", "mall.order.cancel", "mall.order.cancel"),
    /**
     * 订单超时ttl队列
     */
    QUEUE_TTL_ORDER_CANCEL("mall.order.direct.ttl", "mall.order.cancel.ttl", "mall.order.cancel.ttl"),
    /**
     * 礼物超时队列
     */
    QUEUE_GIVE_GIFT("mall.gift.direct", "mall.give.gift", "mall.give.gift"),
    /**
     * 礼物超时ttl队列
     */
    QUEUE_TTL_GIVE_GIFT("mall.gift.direct.ttl", "mall.give.gift.ttl", "mall.give.gift.ttl"),
    /**
     * 订单完成队列
     */
    QUEUE_ORDER_FINISH("mall.order.finish.direct", "mall.order.finish", "mall.order.finish"),
    /**
     * 订单完成ttl队列
     */
    QUEUE_TTL_ORDER_FINISH("mall.order.finish.direct.ttl", "mall.order.finish.ttl", "mall.order.finish.ttl"),
    /**
     * 预约开始队列
     */
    QUEUE_ORDER_START("mall.order.start.direct", "mall.order.start", "mall.order.start"),
    /**
     * 预约开始ttl队列
     */
    QUEUE_TTL_ORDER_START("mall.order.start.direct.ttl", "mall.order.start.ttl", "mall.order.start.ttl");

    /**
     * 交换名称
     */
    private final String exchange;
    /**
     * 队列名称
     */
    private final String name;
    /**
     * 路由键
     */
    private final String routeKey;

    QueueEnum(String exchange, String name, String routeKey) {
        this.exchange = exchange;
        this.name = name;
        this.routeKey = routeKey;
    }
}
