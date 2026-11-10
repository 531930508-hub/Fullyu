package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Coupon;
import com.macro.mall.enums.NormalState;
import com.macro.mall.mapper.CouponMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.io.Serializable;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 券 服务类
 *
 * @author ST
 * @date 2025/06/03
 */
@Service
public class CouponService extends BaseService<CouponMapper, Coupon> {

    @Override
    protected QueryWrapper<Coupon> buildWrapper(Map<String, Object> params, QueryWrapper<Coupon> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("code")
                .like("title")
                .equal("use_type")
                .equal("state")
                .getQueryWrapper();
    }

    /**
     * 校验
     *
     * @param coupon
     */
    public void verify(Coupon coupon) {
        LambdaQueryWrapper<Coupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Coupon::getTitle, coupon.getTitle());
        lqw.eq(Coupon::getUseType, coupon.getUseType());
        lqw.eq(Coupon::getState, NormalState.EFFECTIVE.getValue());
        Long id = coupon.getId();
        if (id != null) {
            lqw.ne(Coupon::getId, id);
        }
        Coupon onlyOne = getOnlyOne(lqw);
        if (onlyOne != null) {
            throw new BusinessException("产品已存在");
        }
    }

    /**
     * 获取有效期
     *
     * @param couponIdList
     * @return
     */
    public Map<Long, Coupon> getCouponMap(List<Long> couponIdList) {
        if (CollectionUtils.isEmpty(couponIdList)) {
            return Collections.emptyMap();
        }
        List<Coupon> couponList = listByIds(couponIdList);
        return couponList.stream().collect(Collectors.toMap(Coupon::getId, s -> s));
    }

    /**
     * 获取会员卡map
     *
     * @return k-> couponId, v-> Coupon
     */
    public Map<Long, Coupon> getCouponLevelMap() {
        LambdaQueryWrapper<Coupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Coupon::getUseType, 2);
        List<Coupon> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyMap();
        }
        return list.stream().filter(s -> s.getVipLevel() != null).collect(Collectors.toMap(Coupon::getId, s -> s));
    }

    /**
     * 失效
     *
     * @param id
     */
    public void invalid(Serializable id) {
        Coupon coupon = getById(id);
        if (coupon == null) {
            throw new BusinessException("产品不存在");
        }
        coupon.setState(NormalState.INVALID.getValue());
        updateById(coupon);
    }
}