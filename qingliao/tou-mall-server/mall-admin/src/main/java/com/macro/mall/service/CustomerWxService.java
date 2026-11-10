package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.consts.RedisKey;
import com.macro.mall.entity.CustomerWx;
import com.macro.mall.mapper.CustomerWxMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.utils.RedisUtil;
import me.chanjar.weixin.mp.bean.result.WxMpUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

/**
 * 微信用户 服务类
 *
 * @author
 * @date 2025/07/23
 */
@Service
public class CustomerWxService extends BaseService<CustomerWxMapper, CustomerWx> {
    @Autowired
    @Lazy
    WxMiniService wxMiniService;
    @Autowired
    RedisUtil redisUtil;

    private final ReentrantLock syncAddLock = new ReentrantLock();

    /**
     * 通过小程序添加
     *
     * @param unionId
     * @param openId
     */
    @Async("ppzAsync")
    public void addByMa(String unionId, String openId) {
        if (StringUtils.isEmpty(unionId) || StringUtils.isEmpty(openId)) {
            return;
        }
        syncAddLock.lock();
        try {
            LambdaQueryWrapper<CustomerWx> queryWrapper = new LambdaQueryWrapper();
            queryWrapper.eq(CustomerWx::getUnionId, unionId);
            CustomerWx customerWx = getOnlyOne(queryWrapper);
            if (customerWx == null) {
                customerWx = new CustomerWx();
                customerWx.setUnionId(unionId);
                customerWx.setMaOpenId(openId);
                customerWx.setMaCreateTime(LocalDateTime.now());
                save(customerWx);
            } else {
                String maOpenId = customerWx.getMaOpenId();
                if (!StringUtils.isEmpty(maOpenId)) {
                    return;
                }
                customerWx.setMaOpenId(openId);
                customerWx.setMaCreateTime(LocalDateTime.now());
                updateById(customerWx);
            }
        } catch (Exception e) {
            log.error("通过小程序添加失败", e);
        } finally {
            syncAddLock.unlock();
        }
    }

    /**
     * 通过公众号添加
     *
     * @param unionId
     * @param openId
     */
    @Async("ppzAsync")
    public void addByMp(String unionId, String openId) {
        if (StringUtils.isEmpty(unionId) || StringUtils.isEmpty(openId)) {
            return;
        }
        syncAddLock.lock();
        try {
            LambdaQueryWrapper<CustomerWx> queryWrapper = new LambdaQueryWrapper();
            queryWrapper.eq(CustomerWx::getUnionId, unionId);
            CustomerWx customerWx = getOnlyOne(queryWrapper);
            if (customerWx == null) {
                customerWx = new CustomerWx();
                customerWx.setUnionId(unionId);
                customerWx.setMpOpenId(openId);
                customerWx.setMpCreateTime(LocalDateTime.now());
                save(customerWx);
            } else {
                String mpOpenId = customerWx.getMpOpenId();
                if (!StringUtils.isEmpty(mpOpenId)) {
                    return;
                }
                customerWx.setMpOpenId(openId);
                customerWx.setMpCreateTime(LocalDateTime.now());
                updateById(customerWx);
            }
        } catch (Exception e) {
            log.error("通过公众号添加失败", e);
        } finally {
            syncAddLock.unlock();
        }
    }

    /**
     * 通过客户id查找公众号openId,缓存1天
     *
     * @param customerId
     * @return
     */
    public String findMpOpenIdByCustomerId(Long customerId) {
        String openId = redisUtil.getString(RedisKey.MQ_OPENID + customerId);
        if (openId != null) {
            return openId;
        }
        openId = baseMapper.findMpOpenIdByCustomerId(customerId);
        if (openId != null) {
            redisUtil.setString(RedisKey.MQ_OPENID + customerId, openId, NormalConst.ONE_DAY_SECONDS);
            return openId;
        }
        wxMiniService.getWxMpUserList();
        openId = baseMapper.findMpOpenIdByCustomerId(customerId);
        if (openId != null) {
            redisUtil.setString(RedisKey.MQ_OPENID + customerId, openId, NormalConst.ONE_DAY_SECONDS);
            return openId;
        }
        throw new BusinessException("获取公众号openId失败");
    }

    /**
     * 批量添加公众号用户
     *
     * @param wxMpUserList
     */
    public void addByMpBatch(List<WxMpUser> wxMpUserList) {
        syncAddLock.lock();
        try {
            int batchSize = 1000;
            Set<String> hasOpenIdSet = new HashSet<>();
            Map<String, CustomerWx> updateMap = new HashMap<>();
            for (int i = 0; i < wxMpUserList.size(); i += batchSize) {
                int endIndex = Math.min(i + batchSize, wxMpUserList.size());
                List<WxMpUser> subWxMpUserList = new ArrayList<>(wxMpUserList.subList(i, endIndex));
                List<String> unionIdList = subWxMpUserList.stream().map(WxMpUser::getUnionId).filter(StringUtils::hasText).collect(Collectors.toList());
                if (CollectionUtils.isEmpty(unionIdList)) {
                    continue;
                }
                LambdaQueryWrapper<CustomerWx> queryWrapper = new LambdaQueryWrapper();
                queryWrapper.in(CustomerWx::getUnionId, unionIdList);
                List<CustomerWx> list = list(queryWrapper);
                Set<String> set = list.stream().filter(s -> StringUtils.hasText(s.getMpOpenId())).map(CustomerWx::getUnionId).collect(Collectors.toSet());
                if (!CollectionUtils.isEmpty(set)) {
                    hasOpenIdSet.addAll(set);
                }
                Map<String, CustomerWx> map = list.stream().filter(s -> !StringUtils.hasText(s.getMpOpenId())).collect(Collectors.toMap(CustomerWx::getUnionId, s -> s, (existing, replacement) -> existing));
                if (!CollectionUtils.isEmpty(map)) {
                    updateMap.putAll(map);
                }
            }
            List<CustomerWx> saveOrUpdateList = new ArrayList<>();
            LocalDateTime now = LocalDateTime.now();
            wxMpUserList.forEach(s -> {
                String openId = s.getOpenId();
                String unionId = s.getUnionId();
                if (StringUtils.isEmpty(unionId) || StringUtils.isEmpty(openId)) {
                    return;
                }
                if (hasOpenIdSet.contains(unionId)) {
                    return;
                }
                CustomerWx customerWx = updateMap.getOrDefault(unionId, null);
                if (customerWx == null) {
                    customerWx = new CustomerWx();
                    customerWx.setUnionId(unionId);
                }
                String mpOpenId = customerWx.getMpOpenId();
                if (StringUtils.hasText(mpOpenId)) {
                    return;
                }
                customerWx.setMpOpenId(openId);
                customerWx.setMpCreateTime(now);
                saveOrUpdateList.add(customerWx);
            });
            if (CollectionUtils.isEmpty(saveOrUpdateList)) {
                return;
            }
            saveOrUpdateBatch(saveOrUpdateList);
        } catch (Exception e) {
            log.error("批量添加公众号用户失败", e);
        } finally {
            syncAddLock.unlock();
        }
    }
}