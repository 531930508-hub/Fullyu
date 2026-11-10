package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.entity.CustomerMassagistRelation;
import com.macro.mall.entity.Massagist;
import com.macro.mall.mapper.CustomerMassagistRelationMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 客户疗愈师关联表 服务类
 *
 * @author ST
 * @date 2025/06/12
 */
@Service
public class CustomerMassagistRelationService extends BaseService<CustomerMassagistRelationMapper, CustomerMassagistRelation> {
    @Autowired
    MassagistService massagistService;

    @Autowired
    CustomerMassagistBlockService customerMassagistBlockService;

    @Override
    protected QueryWrapper<CustomerMassagistRelation> buildWrapper(Map<String, Object> params, QueryWrapper<CustomerMassagistRelation> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("customer_id")
                .getQueryWrapper();
    }

    /**
     * 分页查询带详情
     *
     * @param params
     * @return
     */
    public PageInfo<CustomerMassagistRelation> pageInfo(Map<String, Object> params) {
        PageInfo<CustomerMassagistRelation> page = page(params);
        List<CustomerMassagistRelation> newList= new ArrayList<>();
        List<CustomerMassagistRelation> list = page.getList();
        for (CustomerMassagistRelation customerMassagistRelation : list) {
            if (customerMassagistRelation.getMassagistId() != null) {
                Massagist massagist = massagistService.getById(customerMassagistRelation.getMassagistId());
                if (massagist != null&&massagist.getStatus()==1) {
                    newList.add(customerMassagistRelation);
                }
            }
            page.setList(newList);
        }
        buildDetail(page.getList());
        return page;
    }

    private void buildDetail(List<CustomerMassagistRelation> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> massagistIdList = list.stream().map(CustomerMassagistRelation::getMassagistId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(massagistIdList)) {
            return;
        }
        List<Massagist> massagistList = massagistService.listByIds(massagistIdList);
        Map<Long, Massagist> map = massagistList.stream().collect(Collectors.toMap(Massagist::getId, s -> s));
        list.forEach(s -> s.setMassagist(map.getOrDefault(s.getMassagistId(), null)));
    }

    /**
     * 添加收藏。收藏与暂别互斥：点亮收藏时同步解除同一位疗愈师的暂别。
     *
     * @param customerMassagistRelation
     */
    public void create(CustomerMassagistRelation customerMassagistRelation) {
        LambdaQueryWrapper<CustomerMassagistRelation> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMassagistRelation::getCustomerId, customerMassagistRelation.getCustomerId());
        lqw.eq(CustomerMassagistRelation::getMassagistId, customerMassagistRelation.getMassagistId());
        CustomerMassagistRelation relation = getOnlyOne(lqw);
        if (relation != null) {
            return;
        }
        save(customerMassagistRelation);
        customerMassagistBlockService.removeByCustomerAndMassagist(
                customerMassagistRelation.getCustomerId(), customerMassagistRelation.getMassagistId());
    }
}