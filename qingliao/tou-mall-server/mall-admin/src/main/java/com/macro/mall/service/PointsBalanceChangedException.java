package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;

/**
 * 扣减时余额被并发改动（会员中心返回 422）：必须整体回滚，不能降级成“扣多少算多少”。
 */
public class PointsBalanceChangedException extends BusinessException {
    public PointsBalanceChangedException(String message) {
        super(message);
    }
}
