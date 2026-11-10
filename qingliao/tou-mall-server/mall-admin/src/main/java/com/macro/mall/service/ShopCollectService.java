package com.macro.mall.service;

import cn.hutool.core.date.DateTime;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.entity.CustomerMassagistRelation;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.ShopCollect;
import com.macro.mall.mapper.CustomerMassagistRelationMapper;
import com.macro.mall.mapper.ShopCollectMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 客户门店关联表 服务类
 *
 * @author ST
 * @date 2025/06/12
 */
@Service
public class ShopCollectService extends BaseService<ShopCollectMapper, ShopCollect> {
    @Autowired
    MassagistService massagistService;

    @Override
    protected QueryWrapper<ShopCollect> buildWrapper(Map<String, Object> params, QueryWrapper<ShopCollect> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("customer_id")
                .getQueryWrapper();
    }

  /*  *//**
     * 分页查询带详情
     *
     * @param params
     * @return
     *//*
    public PageInfo<CustomerMassagistRelation> pageInfo(Map<String, Object> params) {
        PageInfo<CustomerMassagistRelation> page = page(params);
        buildDetail(page.getList());
        return page;
    }*/
/*
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
    }*/

    public List<ShopCollect> listByCustomerId(Long customerId) {
        LambdaQueryWrapper<ShopCollect> lqw = new LambdaQueryWrapper<>();
        lqw.eq(ShopCollect::getCustomerId, customerId);
        return list(lqw);
    }

    /**
     * 添加
     *shopCollect
     * @param shopCollect
     */
    public void InsterOrDelete(ShopCollect shopCollect) {
        LambdaQueryWrapper<ShopCollect> lqw = new LambdaQueryWrapper<>();
        lqw.eq(ShopCollect::getCustomerId, shopCollect.getCustomerId());
        lqw.eq(ShopCollect::getShopId, shopCollect.getShopId());
        shopCollect.setCreateTime(DateTime.now().toLocalDateTime());
        ShopCollect checkExit = getOnlyOne(lqw);
        if (checkExit != null) {
            removeById(checkExit.getId());
        }else {
            save(shopCollect);
        }

    }
}