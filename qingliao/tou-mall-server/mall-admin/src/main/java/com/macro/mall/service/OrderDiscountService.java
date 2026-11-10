package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.CollectionUtils;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.entity.OrderDiscount;
import com.macro.mall.enums.NormalState;
import com.macro.mall.mapper.OrderDiscountMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import com.macro.mall.utils.DateUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 订单折扣 服务类
 *
 * @author
 * @date 2025/07/23
 */
@Service
public class OrderDiscountService extends BaseService<OrderDiscountMapper, OrderDiscount> {
    @Autowired
    UmsAdminServiceImpl umsAdminService;

    @Override
    protected QueryWrapper<OrderDiscount> buildWrapper(Map<String, Object> params, QueryWrapper<OrderDiscount> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("sequence")
                .equal("create_user")
                .in("state")
                .equal("shop_id")
                .getQueryWrapper();
    }

    public OrderDiscount saveOrUpd(OrderDiscount orderDiscount) {
        Integer discount = orderDiscount.getDiscount();
        if (orderDiscount.getType() == 1) {
            if (discount < 1) {
                throw new BusinessException("折扣须大于等于1折");
            } else if (discount > 99) {
                throw new BusinessException("折扣须小于等于99折");
            }
        }
        orderDiscount.setCreateUser(umsAdminService.currentId());
        saveOrUpdate(orderDiscount);
        return orderDiscount;
    }

    /**
     * 获取折扣
     *
     * @return
     */
    public OrderDiscount getDiscountByCount(Long count, Long shopId, Integer duration, BigDecimal productAmount) {
        List<String> useTypeList = new ArrayList<>(Collections.singletonList("通用折扣"));
        if (count == 1) {
            useTypeList.add("新客折扣");
        }
        String now = DateUtil.nowString();
        LambdaQueryWrapper<OrderDiscount> lqw = new LambdaQueryWrapper<>();
        lqw.eq(OrderDiscount::getState, NormalState.EFFECTIVE.getValue());
        if (shopId != null) {
            lqw.eq(OrderDiscount::getShopId, shopId);
        }
        lqw.le(OrderDiscount::getStartTime, now);
        lqw.gt(OrderDiscount::getEndTime, now);
        lqw.in(OrderDiscount::getUseType, useTypeList);
        lqw.and(qw -> qw.eq(OrderDiscount::getType, 1).or(q -> q.eq(OrderDiscount::getType, 2).eq(OrderDiscount::getDuration, duration)));
        List<OrderDiscount> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return null;
        }
        BigDecimal totalAmount = BigDecimal.valueOf(duration / NormalConst.PER_COUPON_COST_MINUTES).multiply(productAmount);
        return list.stream().min(Comparator.comparing(discount -> {
            if (discount.getType() == 1) {
                return totalAmount.multiply(BigDecimal.valueOf(discount.getDiscount()));
            } else {
                return BigDecimal.valueOf(discount.getDiscount());
            }
        })).orElse(null);
    }

}