package com.macro.mall.service;

import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.symmetric.AES;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.component.RabbitMqSender;
import com.macro.mall.entity.*;
import com.macro.mall.enums.CouponState;
import com.macro.mall.enums.GiveGiftState;
import com.macro.mall.mapper.GiveGiftMapper;
import com.macro.mall.mapper.GiveTempGiftMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.DateUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 赠送礼物 服务类
 *
 * @author ST
 * @date 2025/06/03
 */
@Service
public class GiveTempGiftService extends BaseService<GiveTempGiftMapper, GiveTempGift> {
    @Override
    protected QueryWrapper<GiveTempGift> buildWrapper(Map<String, Object> params, QueryWrapper<GiveTempGift> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("title")
                .equal("customer_id")
                .equal("is_gift")
                .in("state")
                .getQueryWrapper();
    }
    /**
     * xin购券赠送礼物
     *
     */
    public void createGiftNew(GiveTempGift giveTempGift) {
        save(giveTempGift);
    }

}