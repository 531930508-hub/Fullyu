package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.entity.CustomerCoupon;
import com.macro.mall.entity.Order;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.mapper.PrepaidMemberRewardMapper;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.enums.CouponState;
import com.macro.mall.enums.CouponUseType;
import com.macro.mall.enums.OrderState;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/** 在现有预付券账本上确认实际耗尽；到期、回收、退款均不是消费。 */
@Service
public class PrepaidMemberRewardService {
    @Autowired @Lazy OrderService orderService;
    @Autowired @Lazy CustomerCouponService couponService;
    @Autowired @Lazy MemberCardService memberCardService;

    @Autowired PrepaidMemberRewardMapper mapper;
    @Value("${fullyu.prepaid-member-reward.enabled:false}") boolean enabled;

    public boolean isEnabled() { return enabled; }

    /** 与消费完成同事务写入，不在仍持有消费订单锁的事务内读取其它完成订单。 */
    public void onCompletedOrders(List<Long> orderIds) {
        if (!enabled || orderIds == null || orderIds.isEmpty()) return;
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new BusinessException("赠送会员任务必须与消费完成一并保存");
        orderIds.stream().filter(Objects::nonNull).distinct().sorted().forEach(mapper::queue);
    }

    /** 调度在提交后启动独立RC事务：每次判定看到最新已提交状态，写卡和任务终态原子提交。 */
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public void process(Long sourceOrderId) {
        if (!enabled || sourceOrderId == null) return;
        if (!"PENDING".equals(mapper.lock(sourceOrderId))) return;
        grantIfConsumed(sourceOrderId);
        if (mapper.finish(sourceOrderId) != 1) throw new BusinessException("赠送会员任务状态保存失败");
    }

    @Transactional(rollbackFor = Exception.class)
    public void grantIfConsumed(Long sourceOrderId) {
        if (sourceOrderId == null) return;
        Order initial = orderService.getById(sourceOrderId);
        if (initial == null || initial.getCustomerId() == null) return;
        memberCardService.lockCustomer(initial.getCustomerId());
        Order source = orderService.getOne(new LambdaQueryWrapper<Order>()
            .eq(Order::getId, sourceOrderId).last("FOR UPDATE"));
        if (source == null || source.getCustomerId() == null || !paid(source)
            || Boolean.TRUE.equals(source.getIsGift()) || source.getPayAmount() == null
            || source.getPayAmount().compareTo(BigDecimal.ZERO) <= 0
            || source.getRewardMemberMonths() == null || source.getRewardMemberMonths() <= 0) return;
        List<CustomerCoupon> all = couponService.list(new LambdaQueryWrapper<CustomerCoupon>()
            .eq(CustomerCoupon::getOrderId, sourceOrderId)
            .eq(CustomerCoupon::getUseType, CouponUseType.CASH.getValue()));
        if (all.isEmpty()) return;
        for (CustomerCoupon coupon : all) {
            if (!source.getCustomerId().equals(coupon.getCustomerId())
                || !CouponState.INVALID.getValue().equals(coupon.getState())
                || coupon.getUseOrder() == null || coupon.getUseTime() == null) return;
        }
        Set<Long> consumedOrderIds = all.stream().map(CustomerCoupon::getUseOrder).collect(Collectors.toSet());
        List<Order> consumption = orderService.listByIds(consumedOrderIds);
        Set<Long> completed = consumption.stream()
            .filter(o -> source.getCustomerId().equals(o.getCustomerId())
                && paid(o) && AppointmentState.FINISHED.getValue().equals(o.getAppointmentState()))
            .map(Order::getId).collect(Collectors.toSet());
        if (!completed.containsAll(consumedOrderIds)) return;
        memberCardService.grantPrepaidReward(source, source.getRewardMemberMonths());
    }

    private boolean paid(Order order) {
        return (order.getHasRefundAmount() == null || order.getHasRefundAmount().compareTo(BigDecimal.ZERO) == 0)
            && (OrderState.PAID_NOT_COMMENT.getValue().equals(order.getState())
                || OrderState.PAID_COMMENTED.getValue().equals(order.getState()));
    }
}
