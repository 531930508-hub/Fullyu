package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.CustomerMassagistBlock;
import com.macro.mall.entity.CustomerMassagistRelation;
import com.macro.mall.entity.Massagist;
import com.macro.mall.mapper.CustomerMassagistBlockMapper;
import com.macro.mall.mapper.CustomerMassagistRelationMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 客户暂别的疗愈师 服务类
 *
 * <p>对外统一文案为「收藏 / 暂别」，此处 block 仅为技术语义，不出现在任何界面。</p>
 *
 * @date 2026/11/07
 */
@Service
public class CustomerMassagistBlockService extends BaseService<CustomerMassagistBlockMapper, CustomerMassagistBlock> {

    public static final int SOURCE_CUSTOMER = 1;
    public static final int SOURCE_ADMIN = 2;

    @Autowired
    private MassagistService massagistService;

    @Autowired
    private CustomerMassagistRelationMapper relationMapper;

    @Override
    protected QueryWrapper<CustomerMassagistBlock> buildWrapper(Map<String, Object> params, QueryWrapper<CustomerMassagistBlock> queryWrapper) {
        WrapperBuilder.init(queryWrapper, params)
                .equal("customer_id");
        queryWrapper.orderByDesc("create_time");
        return queryWrapper;
    }

    /**
     * 分页查询并关联疗愈师。离职疗愈师保留记录并置灰显示。
     */
    public PageInfo<CustomerMassagistBlock> pageInfo(Map<String, Object> params) {
        PageInfo<CustomerMassagistBlock> page = page(params);
        buildDetail(page.getList());
        return page;
    }

    private void buildDetail(List<CustomerMassagistBlock> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> massagistIdList = list.stream()
                .map(CustomerMassagistBlock::getMassagistId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        if (CollectionUtils.isEmpty(massagistIdList)) {
            return;
        }
        List<Massagist> massagistList = massagistService.listByIds(massagistIdList);
        Map<Long, Massagist> map = massagistList.stream().collect(Collectors.toMap(Massagist::getId, s -> s));
        list.forEach(s -> s.setMassagist(map.get(s.getMassagistId())));
    }

    /**
     * 设为暂别：幂等；同时解除同一位疗愈师的收藏，保证两者互斥。
     */
    @Transactional(rollbackFor = Exception.class)
    public CustomerMassagistBlock createBlock(Long customerId, Long massagistId, Integer source, String createBy) {
        if (customerId == null) {
            throw new BusinessException("请先登录");
        }
        if (massagistId == null) {
            throw new BusinessException("请选择疗愈师");
        }
        CustomerMassagistBlock exist = getByCustomerAndMassagist(customerId, massagistId);
        if (exist != null) {
            return exist;
        }
        CustomerMassagistBlock block = new CustomerMassagistBlock();
        block.setCustomerId(customerId);
        block.setMassagistId(massagistId);
        block.setSource(source == null ? SOURCE_CUSTOMER : source);
        block.setCreateBy(createBy);
        save(block);
        // 暂别与收藏互斥：同步删除收藏关系
        LambdaQueryWrapper<CustomerMassagistRelation> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMassagistRelation::getCustomerId, customerId);
        lqw.eq(CustomerMassagistRelation::getMassagistId, massagistId);
        relationMapper.delete(lqw);
        return block;
    }

    public CustomerMassagistBlock getByCustomerAndMassagist(Long customerId, Long massagistId) {
        if (customerId == null || massagistId == null) {
            return null;
        }
        LambdaQueryWrapper<CustomerMassagistBlock> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMassagistBlock::getCustomerId, customerId);
        lqw.eq(CustomerMassagistBlock::getMassagistId, massagistId);
        return getOnlyOne(lqw);
    }

    public boolean removeByCustomerAndMassagist(Long customerId, Long massagistId) {
        if (customerId == null || massagistId == null) {
            return false;
        }
        LambdaQueryWrapper<CustomerMassagistBlock> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMassagistBlock::getCustomerId, customerId);
        lqw.eq(CustomerMassagistBlock::getMassagistId, massagistId);
        return remove(lqw);
    }

    /**
     * 客户暂别的疗愈师 id 列表，用于预约链路过滤。
     */
    public List<Long> blockedMassagistIds(Long customerId) {
        if (customerId == null) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<CustomerMassagistBlock> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMassagistBlock::getCustomerId, customerId);
        lqw.select(CustomerMassagistBlock::getMassagistId);
        return list(lqw).stream()
                .map(CustomerMassagistBlock::getMassagistId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
    }

    /**
     * 指定技师是否被该客户设为暂别。
     */
    public boolean isBlocked(Long customerId, Long massagistId) {
        if (customerId == null || massagistId == null) {
            return false;
        }
        return getByCustomerAndMassagist(customerId, massagistId) != null;
    }

    /**
     * 指定技师列表中是否有被该客户设为暂别的技师。
     */
    public boolean isAnyBlocked(Long customerId, List<Long> massagistIdList) {
        if (customerId == null || CollectionUtils.isEmpty(massagistIdList)) {
            return false;
        }
        Set<Long> blocked = blockedMassagistIds(customerId).stream().collect(Collectors.toSet());
        return massagistIdList.stream().anyMatch(blocked::contains);
    }

    /**
     * 从候选池剔除该客户暂别的疗愈师；customerId 为空时原样返回。
     */
    public List<Long> excludeBlocked(Long customerId, List<Long> candidateIdList) {
        if (customerId == null || CollectionUtils.isEmpty(candidateIdList)) {
            return candidateIdList;
        }
        Set<Long> blocked = blockedMassagistIds(customerId).stream().collect(Collectors.toSet());
        if (blocked.isEmpty()) {
            return candidateIdList;
        }
        return candidateIdList.stream()
                .filter(id -> id != null && !blocked.contains(id))
                .collect(Collectors.toList());
    }

    /**
     * 给候选疗愈师打上 blockedByCustomer 瞬态标记（后台看板使用，不从列表剔除）。
     */
    public void markBlocked(Long customerId, List<Massagist> massagistList) {
        if (customerId == null || CollectionUtils.isEmpty(massagistList)) {
            return;
        }
        Set<Long> blocked = blockedMassagistIds(customerId).stream().collect(Collectors.toSet());
        massagistList.forEach(m -> m.setBlockedByCustomer(blocked.contains(m.getId())));
    }

    /**
     * 后台批量统计：客户 -> {favorite, block}。
     */
    public Map<Long, Map<String, Integer>> countByCustomerIds(List<Long> customerIdList) {
        Map<Long, Map<String, Integer>> result = new HashMap<>();
        if (CollectionUtils.isEmpty(customerIdList)) {
            return result;
        }
        for (Long customerId : customerIdList) {
            if (customerId == null) {
                continue;
            }
            Map<String, Integer> item = new LinkedHashMap<>();
            item.put("favorite", relationMapper.selectCount(new LambdaQueryWrapper<CustomerMassagistRelation>()
                    .eq(CustomerMassagistRelation::getCustomerId, customerId)).intValue());
            item.put("block", Math.toIntExact(count(new LambdaQueryWrapper<CustomerMassagistBlock>()
                    .eq(CustomerMassagistBlock::getCustomerId, customerId))));
            result.put(customerId, item);
        }
        return result;
    }

    public List<CustomerMassagistBlock> listByCustomerId(Long customerId) {
        if (customerId == null) {
            return new ArrayList<>();
        }
        LambdaQueryWrapper<CustomerMassagistBlock> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMassagistBlock::getCustomerId, customerId);
        lqw.orderByDesc(CustomerMassagistBlock::getCreateTime);
        List<CustomerMassagistBlock> list = list(lqw);
        buildDetail(list);
        return list;
    }
}
