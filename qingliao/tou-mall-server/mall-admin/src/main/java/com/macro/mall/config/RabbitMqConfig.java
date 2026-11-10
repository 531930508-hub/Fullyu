package com.macro.mall.config;

import com.macro.mall.enums.QueueEnum;
import org.springframework.amqp.core.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;


@Configuration
public class RabbitMqConfig {

// ========== 订单队列 ==========

    /**
     * 订单消息实际消费队列所绑定的交换机
     */
    @Bean
    DirectExchange orderDirect() {
        return ExchangeBuilder
                .directExchange(QueueEnum.QUEUE_ORDER_CANCEL.getExchange())
                .durable(true)
                .build();
    }

    /**
     * 订单延迟队列所绑定的交换机
     */
    @Bean
    DirectExchange orderTtlDirect() {
        return ExchangeBuilder
                .directExchange(QueueEnum.QUEUE_TTL_ORDER_CANCEL.getExchange())
                .durable(true)
                .build();
    }

    /**
     * 订单实际消费队列
     */
    @Bean
    public Queue orderQueue() {
        return new Queue(QueueEnum.QUEUE_ORDER_CANCEL.getName());
    }

    /**
     * 订单延迟队列（死信队列）
     */
    @Bean
    public Queue orderTtlQueue() {
        return QueueBuilder
                .durable(QueueEnum.QUEUE_TTL_ORDER_CANCEL.getName())
                .withArgument("x-dead-letter-exchange", QueueEnum.QUEUE_ORDER_CANCEL.getExchange())//到期后转发的交换机
                .withArgument("x-dead-letter-routing-key", QueueEnum.QUEUE_ORDER_CANCEL.getRouteKey())//到期后转发的路由键
                .build();
    }

    /**
     * 将订单队列绑定到交换机
     */
    @Bean
    Binding orderBinding(DirectExchange orderDirect, Queue orderQueue) {
        return BindingBuilder
                .bind(orderQueue)
                .to(orderDirect)
                .with(QueueEnum.QUEUE_ORDER_CANCEL.getRouteKey());
    }

    /**
     * 将订单延迟队列绑定到交换机
     */
    @Bean
    Binding orderTtlBinding(DirectExchange orderTtlDirect, Queue orderTtlQueue) {
        return BindingBuilder
                .bind(orderTtlQueue)
                .to(orderTtlDirect)
                .with(QueueEnum.QUEUE_TTL_ORDER_CANCEL.getRouteKey());
    }

// ========== 送礼队列 ==========

    /**
     * 送礼消息实际消费队列所绑定的交换机
     */
    @Bean
    DirectExchange giveGiftDirect() {
        return ExchangeBuilder
                .directExchange(QueueEnum.QUEUE_GIVE_GIFT.getExchange())
                .durable(true)
                .build();
    }

    /**
     * 送礼延迟队列所绑定的交换机
     */
    @Bean
    DirectExchange giveGiftTtlDirect() {
        return ExchangeBuilder
                .directExchange(QueueEnum.QUEUE_TTL_GIVE_GIFT.getExchange())
                .durable(true)
                .build();
    }

    /**
     * 送礼实际消费队列
     */
    @Bean
    public Queue giveGiftQueue() {
        return new Queue(QueueEnum.QUEUE_GIVE_GIFT.getName());
    }

    /**
     * 送礼延迟队列（死信队列）
     */
    @Bean
    public Queue giveGiftTtlQueue() {
        return QueueBuilder
                .durable(QueueEnum.QUEUE_TTL_GIVE_GIFT.getName())
                .withArgument("x-dead-letter-exchange", QueueEnum.QUEUE_GIVE_GIFT.getExchange())//到期后转发的交换机
                .withArgument("x-dead-letter-routing-key", QueueEnum.QUEUE_GIVE_GIFT.getRouteKey())//到期后转发的路由键
                .build();
    }

    /**
     * 将送礼队列绑定到交换机
     */
    @Bean
    Binding giveGiftBinding(DirectExchange giveGiftDirect, Queue giveGiftQueue) {
        return BindingBuilder
                .bind(giveGiftQueue)
                .to(giveGiftDirect)
                .with(QueueEnum.QUEUE_GIVE_GIFT.getRouteKey());
    }

    /**
     * 将送礼延迟队列绑定到交换机
     */
    @Bean
    Binding giveGiftTtlBinding(DirectExchange giveGiftTtlDirect, Queue giveGiftTtlQueue) {
        return BindingBuilder
                .bind(giveGiftTtlQueue)
                .to(giveGiftTtlDirect)
                .with(QueueEnum.QUEUE_TTL_GIVE_GIFT.getRouteKey());
    }

// ========== 订单完成 ==========

    /**
     * 订单完成实际消费队列所绑定的交换机
     */
    @Bean
    DirectExchange orderFinishDirect() {
        return ExchangeBuilder
                .directExchange(QueueEnum.QUEUE_ORDER_FINISH.getExchange())
                .durable(true)
                .build();
    }

    /**
     * 订单完成延迟队列所绑定的交换机
     */
    @Bean
    DirectExchange orderFinishTtlDirect() {
        return ExchangeBuilder
                .directExchange(QueueEnum.QUEUE_TTL_ORDER_FINISH.getExchange())
                .durable(true)
                .build();
    }

    /**
     * 订单完成实际消费队列
     */
    @Bean
    public Queue orderFinishQueue() {
        return new Queue(QueueEnum.QUEUE_ORDER_FINISH.getName());
    }

    /**
     * 订单完成延迟队列（死信队列）
     */
    @Bean
    public Queue orderFinishTtlQueue() {
        return QueueBuilder
                .durable(QueueEnum.QUEUE_TTL_ORDER_FINISH.getName())
                .withArgument("x-dead-letter-exchange", QueueEnum.QUEUE_ORDER_FINISH.getExchange())//到期后转发的交换机
                .withArgument("x-dead-letter-routing-key", QueueEnum.QUEUE_ORDER_FINISH.getRouteKey())//到期后转发的路由键
                .build();
    }

    /**
     * 将订单完成队列绑定到交换机
     */
    @Bean
    Binding orderFinishBinding(DirectExchange orderFinishDirect, Queue orderFinishQueue) {
        return BindingBuilder
                .bind(orderFinishQueue)
                .to(orderFinishDirect)
                .with(QueueEnum.QUEUE_ORDER_FINISH.getRouteKey());
    }

    /**
     * 将订单完成延迟队列绑定到交换机
     */
    @Bean
    Binding orderFinishTtlBinding(DirectExchange orderFinishTtlDirect, Queue orderFinishTtlQueue) {
        return BindingBuilder
                .bind(orderFinishTtlQueue)
                .to(orderFinishTtlDirect)
                .with(QueueEnum.QUEUE_TTL_ORDER_FINISH.getRouteKey());
    }

// ========== 预约开始 ==========

    /**
     * 预约开始实际消费队列所绑定的交换机
     */
    @Bean
    DirectExchange orderStartDirect() {
        return ExchangeBuilder
                .directExchange(QueueEnum.QUEUE_ORDER_START.getExchange())
                .durable(true)
                .build();
    }

    /**
     * 预约开始延迟队列所绑定的交换机
     */
    @Bean
    DirectExchange orderStartTtlDirect() {
        return ExchangeBuilder
                .directExchange(QueueEnum.QUEUE_TTL_ORDER_START.getExchange())
                .durable(true)
                .build();
    }

    /**
     * 预约开始实际消费队列
     */
    @Bean
    public Queue orderStartQueue() {
        return new Queue(QueueEnum.QUEUE_ORDER_START.getName());
    }

    /**
     * 预约开始延迟队列（死信队列）
     */
    @Bean
    public Queue orderStartTtlQueue() {
        return QueueBuilder
                .durable(QueueEnum.QUEUE_TTL_ORDER_START.getName())
                .withArgument("x-dead-letter-exchange", QueueEnum.QUEUE_ORDER_START.getExchange())//到期后转发的交换机
                .withArgument("x-dead-letter-routing-key", QueueEnum.QUEUE_ORDER_START.getRouteKey())//到期后转发的路由键
                .build();
    }

    /**
     * 将预约开始队列绑定到交换机
     */
    @Bean
    Binding orderStartBinding(DirectExchange orderStartDirect, Queue orderStartQueue) {
        return BindingBuilder
                .bind(orderStartQueue)
                .to(orderStartDirect)
                .with(QueueEnum.QUEUE_ORDER_START.getRouteKey());
    }

    /**
     * 将预约开始延迟队列绑定到交换机
     */
    @Bean
    Binding orderStartTtlBinding(DirectExchange orderStartTtlDirect, Queue orderStartTtlQueue) {
        return BindingBuilder
                .bind(orderStartTtlQueue)
                .to(orderStartTtlDirect)
                .with(QueueEnum.QUEUE_TTL_ORDER_START.getRouteKey());
    }

}

