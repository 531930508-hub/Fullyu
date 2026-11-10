package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.BasicCustomerTag;
import com.macro.mall.entity.CustomerTag;
import com.macro.mall.mapper.CustomerTagMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 客户标签 服务类
 *
 * @author ST
 * @date 2025/07/10
 */
@Service
public class CustomerTagService extends BaseService<CustomerTagMapper, CustomerTag> {
    @Autowired
    @Lazy
    UmsAdminServiceImpl umsAdminService;
    @Autowired
    @Lazy
    BasicCustomerTagService basicCustomerTagService;

    public List<CustomerTag> findByBasicCustomerTagIds(List<Long> ids) {
        if (CollectionUtils.isEmpty(ids)) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<CustomerTag> lqw = new LambdaQueryWrapper<>();
        lqw.in(CustomerTag::getBasicCustomerTagId, ids);
        return list(lqw);
    }

    public Map<Long, List<CustomerTag>> mapByCustomerIdList(List<Long> customerIdList) {
        if (CollectionUtils.isEmpty(customerIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<CustomerTag> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.in(CustomerTag::getCustomerId, customerIdList);
        return list(queryWrapper).stream().collect(Collectors.groupingBy(CustomerTag::getCustomerId));
    }

    public void checkAndSave(CustomerTag customerTag) {
        LambdaQueryWrapper<CustomerTag> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(CustomerTag::getBasicCustomerTagId, customerTag.getBasicCustomerTagId());
        queryWrapper.eq(CustomerTag::getCustomerId, customerTag.getCustomerId());
        if (count(queryWrapper) > 0) {
            throw new BusinessException("标签已存在");
        }
        customerTag.setCreateUser(umsAdminService.currentId());
        save(customerTag);
        return;
    }

    /**
     * 根据客户id获取标签idList
     *
     * @param customerId
     * @return
     */
    public List<Long> findTagIdListByCustomerId(Long customerId) {
        Map<Long, List<CustomerTag>> map = mapByCustomerIdList(Collections.singletonList(customerId));
        List<CustomerTag> list = map.getOrDefault(customerId, Collections.emptyList());
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyList();
        }
        return list.stream().map(CustomerTag::getBasicCustomerTagId).collect(Collectors.toList());
    }

    /**
     * 批量添加
     *
     * @param customerId
     * @param basicCustomerTagList
     */
    public void saveTagListByBasicTag(Long customerId, List<BasicCustomerTag> basicCustomerTagList) {
        if (customerId == null || CollectionUtils.isEmpty(basicCustomerTagList)) {
            return;
        }
        List<Long> tagIdList = basicCustomerTagList.stream().map(BasicCustomerTag::getId).collect(Collectors.toList());
        LambdaQueryWrapper<CustomerTag> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.in(CustomerTag::getBasicCustomerTagId, tagIdList);
        queryWrapper.eq(CustomerTag::getCustomerId, customerId);
        List<CustomerTag> list = list(queryWrapper);
        if (!CollectionUtils.isEmpty(list)) {
            List<Long> basicTagIdList = list.stream().map(CustomerTag::getBasicCustomerTagId).collect(Collectors.toList());
            basicCustomerTagList = basicCustomerTagList.stream().filter(s -> !basicTagIdList.contains(s.getId())).collect(Collectors.toList());
        }
        List<CustomerTag> customerTagList = basicCustomerTagList.stream().map(s -> {
            CustomerTag customerTag = new CustomerTag();
            customerTag.setCustomerId(customerId);
            customerTag.setBasicCustomerTagId(s.getId());
            customerTag.setTitle(s.getTitle());
            customerTag.setShopId(s.getShopId());
            return customerTag;
        }).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(customerTagList)) {
            return;
        }
        saveBatch(customerTagList);
    }

    @Override
    protected QueryWrapper<CustomerTag> buildWrapper(Map<String, Object> params, QueryWrapper<CustomerTag> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("customer_id")
                .getQueryWrapper();
    }

    public Set<Long> findCustomerIdByTagIdList(List<Long> basicCustomerTagIdList) {
        if (CollectionUtils.isEmpty(basicCustomerTagIdList)) {
            return Collections.emptySet();
        }
        LambdaQueryWrapper<CustomerTag> lqw = new LambdaQueryWrapper<>();
        lqw.select(CustomerTag::getCustomerId);
        lqw.in(CustomerTag::getBasicCustomerTagId, basicCustomerTagIdList);
        return list(lqw).stream().map(CustomerTag::getCustomerId).collect(Collectors.toSet());
    }
}